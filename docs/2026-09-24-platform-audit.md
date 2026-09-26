# LeadFlow: initial audit and proposed upgrade scope

Date: 2026-09-24. Status: initial code investigation and design proposal, not an implementation or production certification.

## Intended outcome

Repair business discovery and Instagram automation, complete existing broken workflows, and redesign LeadFlow as a reliable SaaS application. The user explicitly requires strictly free lead sources. No paid Google Places dependency belongs in the proposed discovery flow. A sourced business record is a prospect, not proof of buying intent or contact deliverability.

## Architecture inspected

React/Vite/TypeScript frontend with React Query, Zustand UI state and Tailwind components. Express API, PostgreSQL migrations, Redis/BullMQ jobs, WebSocket progress, browser extraction, website enrichment, SMTP outreach and Meta integrations. Main user modules: discovery, pipeline, outreach, sequences, Instagram and settings.

Both the API entry point and standalone worker entry point start workers and the Instagram poller. Queue workers can share work, but the poller's process-local lock does not coordinate separate processes. This needs explicit deployment ownership and distributed coordination.

This is not a completed line-by-line review of every file. Production account settings and live delivery have not been tested.

## Confirmed code findings

| Priority | Evidence | Consequence |
| --- | --- | --- |
| Critical | `server/src/lib/places.ts`: `searchPlaces` replaces missing configuration, API errors and empty results with `stagingSearch` | Generated businesses enter the discovery flow instead of reporting the real failure or no results. |
| High | `server/src/lib/crawler.ts`: staging generates email and social URLs for the input domain | Contact data can be invented instead of observed. |
| High | `server/src/lib/directory-scraper.ts`: Maps extracts names and assigns the search location as address; IDs are random | Incomplete records and unstable deduplication; no actual business detail extraction for Maps. |
| Critical | `server/src/routes/instagram-webhook.ts`: account match includes a global account-count fallback | Automations can match unrelated connected accounts. |
| Critical | Same webhook file contains literal fallback app secrets and verification tokens | Remove hardcoded credentials and rotate exposed credentials through the account owner; values intentionally omitted from this report. |
| High | Instagram handlers use `processing`, `ignored`, `comment_text`, `media_id`, `media_url`, `action_taken`; checked-in event migration lacks these | Fresh installations cannot execute those queries successfully. Existing database state has not been inspected. |
| High | Webhook, poller and manual Instagram paths perform sends separately; event table lacks a unique trigger identity | Concurrent paths can send duplicates; checking before insertion is not a durable lock. |
| High | OAuth callback accepts only `code`; generated state is not validated on the server | OAuth callback is not bound to the initiating session by server-side state. |
| High | `server/src/app.ts`, jobs router and error handler allow/reflect arbitrary origins | Intended CORS allowlist is ineffective. |
| High | `server/src/queue.ts` declares sequence queue; neither entry point registers a sequence worker | Enrolling a lead does not supply a sequence execution engine. |
| Medium | Organization/profile settings use timeouts and success toasts | Saving does not persist those settings. |
| Medium | `src/lib/api-client.ts` prefers error code over explanatory message | Actionable integration failures can appear as generic errors. |
| Medium | App shell and settings navigation use fixed desktop widths | Responsive redesign is needed; browser accessibility and layout testing remain outstanding. |

The Google radius request also mixes Nearby fields into Text Search. This is a legacy repair candidate, but paid Places is outside the user's selected discovery strategy.

## Baseline verification

- `rtk npm run build`: passed; approximately 698 kB main JavaScript bundle and size warning.
- `rtk npm run typecheck:server`: passed.
- `rtk npm test -- --run`: passed, 14 tests in two utility/scoring suites. These do not verify discovery or Instagram.
- `rtk npm run lint`: failed to start because `@typescript-eslint/parser` is missing.
- Server integration tests were not run: global setup force-drops and recreates `leadflow_test` using the configured database server. First provide a dedicated disposable local database and validate its target.
- This workspace is not a Git repository; there is no local revision history or safe commit baseline available.
- Build generated local build outputs; no application source or credentials were edited during the audit.

## Options

1. **Recommended: retain the current stack, repair trust and isolation first, then replace discovery and redesign workflows.** Preserves working modules and allows regression checks around each change.
2. Browser extraction as the primary discovery engine. Requires individual supported directory adapters, ongoing selector maintenance and permission checks. Random scrolling already exists and has not solved data completeness; it cannot guarantee no bans.
3. Full rewrite. Greater migration and regression cost without evidence that React, Express or PostgreSQL are the root problem.

## Proposed stages

### 1. Trustworthy records and safe foundations

Remove automatic synthetic fallbacks from production discovery/enrichment. Restrict fixtures to explicit isolated development tests. Return distinct empty, unavailable, rate-limited and failed states. Preserve existing records; flag identifiable fixture provenance for review instead of silently deleting records. Repair CORS, credential configuration, OAuth state validation, missing migrations and test tooling. Add isolated integration test setup.

### 2. Strictly free discovery

Introduce provider adapters around the existing job system. Use open business data with stable source IDs, attribution, source URL and observation time. Start with OSM-compatible data; support regional open-data imports/local queries and an explicitly configured policy-compatible endpoint. Public community services must not be the unbounded production backend.

Search by country, city/bounds and category; distinguish unsupported category from no matches. Display observed name, address, coordinates, website and phone only when present. Enrich from public business websites with bounded requests and preserve field-level evidence. Missing data remains missing. Deduplicate per organization using stable source identity plus carefully scoped contact/location matching.

Directory browsing is an adapter capability only where automated access is permitted and tested. Respect robots rules, access restrictions, rate limits and Retry-After; pause on challenges. No CAPTCHA bypass, proxy rotation or promises of ban immunity. Google Maps can be an outbound verification link; it is not a guaranteed free bulk data source.

Define real job lifecycle, cancellation, bounded retries, page/byte/time caps and partial-result reporting. Apply shared provider quotas across tenants and workers. Protect website fetches and browser navigation from private-network access, including redirects and DNS resolution. Source data is untrusted input.

Free data access does not eliminate hosting/storage costs. Coverage and available contact details vary by location; never fill gaps with invented data.

### 3. Instagram automation repair

Unify webhook, manual sync and polling into one account-scoped ingestion service. Persist and deduplicate incoming events before acknowledging acceptance. Use durable unique event identities and an outbox/recovery mechanism for the database-to-queue boundary. The worker reads current account credentials and automation state at execution time.

Track public replies and private messages separately. Do not mark a DM sent because a public reply already exists. Retry known transient failures with bounded backoff, surface token/permission problems, and explicitly track ambiguous delivery outcomes rather than blindly resending. Exactly-once external delivery cannot be guaranteed across an uncertain provider response.

Support comment keyword replies and supported inbound message/story events after verifying Meta's current event shapes and permissions. Hide or disable unsupported triggers rather than advertising them as working. Show account connection, permissions, webhook health, last event, queued/sent/failed counts and useful failure reasons. Test with mocked provider calls first; real account delivery needs an authorized test recipient and configured Meta app.

### 4. Complete workflows and UI redesign

Responsive shell with Overview, Discover, Leads, Outreach, Automations and Settings. Use restrained neutral surfaces, one accent, clear typography, accessible contrast and visible focus states. Discovery shows query, source coverage, progress and evidence-backed results. Lead details prioritize observed contacts, provenance and activity. Instagram separates connection setup, automation editing and execution history.

Persist organization/profile/preferences through authenticated APIs with role checks and validation. Implement the existing sequence execution contract with pause/resume, scheduling, suppression, terminal states and retry handling; validate campaign send behavior and tenant isolation. Remove simulated success states. Include loading, empty, error and recovery states on every primary workflow. Add route-level splitting and validate mobile layouts.

Billing, subscriptions and commercial plan entitlements need a separate product decision; the current hardcoded Free Plan label does not establish those requirements.

## Acceptance criteria for a release claim

1. Fresh database migration and existing-schema upgrade tests pass in an isolated database.
2. Source failures never yield generated prospects or invented contact data.
3. Imported/discovered records retain source identity and attribution; repeat jobs do not duplicate the same source entity.
4. Duplicate Instagram webhook/poll events and cross-tenant events are covered by regression tests; account/media filtering is strict.
5. Sending, pause, disconnect, retry and token failure states are truthfully reflected in the UI.
6. Settings survive reload; sequence enrollment actually advances through supported steps.
7. Build, lint, typechecks and relevant unit/integration checks pass; browser flows are exercised at desktop and mobile widths.
8. Deployment has explicit worker ownership, startup validation, health checks, shutdown behavior and documented backup/restore steps.
9. Any unverified external integration, permission or delivery requirement remains clearly listed before production approval.

## References checked

- [Overpass API and public instance usage](https://wiki.openstreetmap.org/wiki/Overpass_API): queryable OSM data; public instance limits and suitability differ. Prefer local extracts or self-hosted data for a commercial service using free data.
- [Public Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/): do not use the public geocoder as a bulk business directory.
- [Google Text Search request shape](https://developers.google.cn/maps/documentation/places/web-service/text-search?hl=en): reference for the existing radius defect, not a proposed paid dependency.
- Meta documentation retrieval failed during this audit; current capabilities must be verified before finalizing Instagram trigger support.

## Next design decision

Review the recommended repair-in-place approach and stage order. After that, write the focused implementation spec for stage 1 and free discovery, carrying Instagram and UI requirements forward as explicit subsequent milestones. This proposal is not a claim that all bugs have been found or fixed.
