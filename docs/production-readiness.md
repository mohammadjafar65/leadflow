# LeadFlow implementation and release notes — 25 September 2026

The source changes are implemented locally. This is **not a production certification or deployment**. PostgreSQL migrations, Redis-backed integration tests, and real Meta/SMTP delivery still require staging verification. No live outreach was sent during this work.

## What changed

- Discovery now uses free OpenStreetMap data, through a local JSONL extract or an explicitly configured Overpass endpoint. Google billing is not required. Results retain source URLs, provider IDs, attribution and observation times; empty/error responses never generate replacement businesses.
- Imports use background jobs, organization-scoped source deduplication, cancellation checks and an enrichment outbox. Enrichment reports observed contact data; public HTTP fetching pins DNS and blocks private-network targets, oversized responses and excessive redirects.
- Instagram OAuth state is single-use and workspace-bound; webhooks require HMAC verification. Webhooks and comment sync share durable event ingestion. Delivery receipts survive automation deletion, deduplicate external account/event IDs, and track ambiguous outcomes conservatively. One Instagram account has one workspace owner. Public reply failures do not turn a confirmed DM into a failed DM. Unsupported follower-welcome automation is removed from creation options.
- Sequence execution handles delays, email steps and event branches, with pause/resume/cancel controls and tenant checks. Confirmed actions are not replayed. Campaign delivery now serializes per campaign and requires a fresh claim; interrupted/ambiguous sends require review instead of automatic resend.
- Settings persist profile and organization changes. The overview uses database aggregates. Navigation, discovery, settings and shared styling were redesigned, and main sections are loaded separately.
- Website audit findings come from fetched HTML. Timing, visual layout, conversion and security measurements are marked unmeasured; failed inspection cannot prove a site is dead. The displayed HTML score is metadata coverage, not a Lighthouse score.
- SMTP credentials use authenticated encryption; production rejects plaintext legacy credentials. TLS certificate validation is enabled. Docker build contexts exclude environment secrets and local backups. Health checks cover PostgreSQL and Redis. API-only execution is the default; worker startup is explicit.

## Free source setup

Choose one source mode in the server environment:

```dotenv
# Local regional extract (preferred for regular SaaS usage)
OPEN_DATA_FILE=/data/businesses.jsonl
OVERPASS_URL=
GEOCODER_URL=

# Alternatively, leave OPEN_DATA_FILE empty and configure an endpoint whose
# operator permits this deployment's usage. No default endpoint is activated.
# OVERPASS_URL=https://your-permitted-endpoint.example/api/interpreter
# GEOCODER_URL=https://your-permitted-geocoder.example/search
OPEN_DATA_DAILY_QUERIES=100
```

A local file contains one original OSM element per line: `type`, numeric `id`, `tags`, and either `lat`/`lon` or a way/relation `center`. Preserve original identifiers and tags; do not invent contact information. Obtain a regional extract under its license and convert named business elements to this JSONL format with an OSM export tool. Import validation is available with:

The old `path/to/export.jsonl` text was an example, **not a file supplied by this project**. Upload a real OSM JSONL export before importing. The importer does not download data. It now runs with plain Node, without `npx` or `tsx`:

```bash
# In your deployed server directory, after uploading the current scripts/ and dist/:
node scripts/import-open-data.mjs --help
read -r -p "Full path to your uploaded OSM JSONL export: " OSM_INPUT
if [ -f "$OSM_INPUT" ]; then
  node scripts/import-open-data.mjs "$OSM_INPUT" "$PWD/data/businesses.jsonl"
else
  printf 'File not found. Upload an actual export before importing.\n'
fi
```

Locally, build the server before using the importer. Set `OPEN_DATA_FILE` to the absolute output path printed by the command in **both API and worker** environments and restart them. The package also exposes `npm run data:import -- INPUT OUTPUT`, where both arguments must be real paths. For the separate hosting npm error, see [hosting-install-troubleshooting.md](hosting-install-troubleshooting.md).

The importer creates a new file and refuses to overwrite an existing file. Files must be partitioned below the runtime 100 MB cap. Searches return at most 500 matches. Local city search matches stored address terms, so coordinate/radius search is more reliable when address tags are incomplete. Changing a file can leave cached results for up to 15 minutes.

Remote searches share a request lock, a daily query cap, a 10 MB Overpass response budget, a 15-minute result cache, and provider cooldowns. These safeguards do not guarantee access or make public services suitable for unrestricted commercial use. Follow the chosen operator's policies. A configured public HTTPS hostname is required by the public-network fetch boundary; loopback/private endpoints are rejected. Regular broad discovery should use regional files or a permitted hosted service.

References: [Overpass API and usage](https://wiki.openstreetmap.org/wiki/Overpass_API), [OSM attribution/license](https://www.openstreetmap.org/copyright), [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/).

`docs/verification/free-source-smoke.json` records one bounded, live Overpass query that returned three named business records. It verifies fetching and normalization, **not** ownership, buying intent, current operation, deliverability or CRM import. Those businesses were not imported into the user's database. No paid source, stealth fingerprinting, CAPTCHA bypass or ban guarantee was added.

## Instagram setup and limits

Set `META_APP_ID`, `META_APP_SECRET`, a private `META_WEBHOOK_VERIFY_TOKEN`, and the public client origin. Register the exact frontend return URL `<CLIENT_ORIGIN>/instagram` and webhook URL `<API_ORIGIN>/api/v1/instagram/webhook` in the Meta app. Connect a supported business account with the required permissions and webhook subscriptions. Confirm current requirements in the Meta dashboard for the app's account/login configuration; approval and account permissions cannot be supplied by code.

Supported rule types are comment-to-DM, keyword DM and story reply. Sync fetches recent comments and queues eligible items; it does not mean a message has been sent. New-follower messaging is not supported. A 100-attempt daily account safeguard is an application limit, not a claim about Meta's current quota. Verify provider messaging windows, permission scope and app review in staging before enabling rules. Unknown outcomes must be checked on Instagram before an operator decides on any further action; automatic replay is intentionally disabled. Automatic comment polling is not enabled; webhooks are the primary path and Sync is the manual recovery path.

## Deployment order

1. Back up the actual database and record its applied migrations. This workspace has no Git history; original source copies remain under `.superpowers/backups/2026-09-24`. Treat the backups as sensitive because old source contained embedded credentials. Rotate those credentials before release.
2. Provision PostgreSQL 16 with `cube` and `earthdistance`, plus persistent Redis. Use Node 22.12+ (or a compatible later version). Configure distinct random JWT access/refresh secrets, a private `ENCRYPTION_KEY`, exact allowed `CLIENT_ORIGIN` values, and the chosen free source.
3. Check existing Instagram ownership before migration: `select ig_user_id,count(*) from instagram_accounts group by ig_user_id having count(*)>1;`. Resolve conflicts deliberately. The new unique ownership index refuses ambiguous existing data; it does not silently delete connections.
4. Install from both lockfiles, run the builds, and apply `npm --prefix server run migrate` against **staging first**. Six new migrations cover provenance/outboxes, Instagram delivery/OAuth/receipts, preferences, sequence actions and campaign receipts. Test the full upgrade against a copy of the deployed schema. Data-affecting rollback requires restoring the backup; do not assume partial down migrations restore prior semantics.
5. Start the API with `RUN_WORKERS=false` and one standalone worker (`node server/dist/src/worker/index.js`), or set `RUN_WORKERS=true` for the combined process. Do not accidentally run both topologies. `docker-compose.prod.yml` uses the combined process. Mount the local extract into the container and set `OPEN_DATA_FILE` to its in-container path if using local data.
6. Re-save any plaintext legacy SMTP credentials. Preserve the old `SMTP_ENCRYPTION_KEY` only for decrypting existing legacy encrypted values until re-saved. New values use `ENCRYPTION_KEY`; losing or changing that key without re-encryption makes stored credentials unreadable.
7. Verify health, login/logout, two-workspace isolation, import/reimport/cancellation, Redis outage recovery, Meta connection/webhook/delivery, and opt-in test email/sequence delivery. Configure TLS termination, backups, monitoring and operational recovery before public release.

## Verification actually run

| Check | Result |
|---|---|
| Frontend build | Passed, Vite 7 / React Router 7 |
| Server TypeScript/build | Passed |
| Frontend unit suite | 14 tests passed |
| Server isolated unit suite | 20 tests passed |
| ESLint | 0 errors, 7 existing explicit-any warnings |
| npm dependency audit | 0 reported vulnerabilities in both lockfiles after updates |
| Headless Chromium UI | Overview, discovery, settings, sequences and Instagram at 1440 and 390 px; no page errors or main-content overflow; search empty state passed |
| Public HTTP fetch | Live HTTPS request succeeded with pinned DNS fetcher |
| Free discovery source | One live bounded Overpass query returned 3 named records |
| PostgreSQL/Redis integration suite | Not run successfully: no disposable local services available |
| Real Meta/SMTP delivery | Not attempted; needs configured staging accounts and permission verification |

Browser checks used isolated API fixtures, not a live logged-in tenant. Screenshots and machine-readable output are under `docs/verification`. Unit tests cover source truthfulness, normalization, private addresses, signature/matching rules, cancellation publication, sequence claim conflicts, SMTP encryption, audit evidence, confirmed DM outcome preservation and pre-claim queue failure recovery. They do not prove distributed behavior against PostgreSQL/Redis.

For integration testing, explicitly set `TEST_DATABASE_URL` to a disposable localhost database named `leadflow_test`, then run `npm run test:server`. The setup **drops and recreates only that named database**. It refuses missing, remote and differently named targets rather than deriving a test database from production credentials.

## Remaining release gates and limitations

The database migrations, concurrent workers and real authentication/integration paths need staging execution. There is no claim that every legacy bug has been eliminated. Native directory-browser automation, universal country coverage, business validation and purchase-intent verification are not implemented. Email open/click branches require real events to be recorded; the new scheduler does not introduce an open/click tracking service. SMTP ambiguous outcomes conservatively become unknown. Unknown receipts currently need operator review rather than a guided reconciliation UI. Local files are a bounded extract mechanism, not a full search index for country-sized datasets. Legacy unused scraper code remains on disk, but the new discovery route does not invoke it.

The independent static reviewer found six important issues in worker concurrency, receipt retention, account ownership, outbox recovery and campaign re-entry. Code mitigations were applied; the review was bounded and did not replace staging integration tests.
