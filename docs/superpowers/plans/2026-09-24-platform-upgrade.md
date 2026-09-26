# LeadFlow Platform Upgrade Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects that method. Execute tasks in dependency order; track steps below. Do not send real outreach as a test.

**Goal:** Deliver truthful free-source discovery, reliable account-scoped Instagram automation, complete existing workflows and a responsive SaaS interface.

**Architecture:** Retain React, Express, PostgreSQL and BullMQ. Separate external-source acquisition from normalization and persistence. Funnel all Instagram trigger paths through a durable event/outbox service; keep API, worker and UI states consistent.

**Tech Stack:** TypeScript, React 18, Vite 5, Tailwind, Express 4, PostgreSQL, Redis/BullMQ, Vitest, Supertest and Playwright.

**Spec:** [Approved audit and upgrade scope](../../2026-09-24-platform-audit.md). The user approved the repair-in-place approach and stage order after selecting strictly free sources.

## Global constraints

- Strictly free lead sources. No paid Google Places dependency belongs in the proposed discovery flow.
- Missing data remains missing. Never substitute generated businesses or guessed contact details.
- Preserve existing records; quarantine identifiable fixtures for review instead of deleting them.
- No automatic CAPTCHA bypass or claims of ban immunity.
- Public community data endpoints are not unbounded commercial infrastructure. Prefer local extracts and configurable policy-compatible endpoints.
- Mock provider delivery during development; a real Meta/SMTP delivery requires an explicitly authorized test recipient.
- Do not read or print secret values to diagnose configuration. Remove literal fallback secrets and document owner-managed rotation.
- Workspace is not a Git repository. Do not fabricate commits; retain a local source backup before edits and report file changes.
- Production readiness requires the acceptance checks below, not merely successful compilation.

## Execution units and dependencies

1. Foundations and truthful data (tasks 1–3).
2. Free discovery and evidence (tasks 4–6), after foundations.
3. Instagram delivery (tasks 7–9), after foundations.
4. Existing workflows and interface (tasks 10–12), after API contracts are stable.
5. Release verification (task 13).

## Review focus

1. Empty/blocked sources must remain distinguishable from legitimate zero matches (tasks 3, 4, 6).
2. Concurrent duplicate Instagram events must not cross accounts or create duplicate action requests (tasks 7–9).
3. Cancellation/disconnection between queueing and execution must prevent new work (tasks 6, 8, 11).
4. Public URLs redirecting or resolving to private networks must be rejected (task 5).
5. Settings and workflow UI must remain accurate after reload, session expiry and narrow-screen navigation (tasks 10–12).

## Task 1: Isolated verification and recovery baseline

**Files:** modify `package.json`, `.eslintrc.cjs`, `server/package.json`, `server/vitest.config.ts`, `server/tests/global-setup.ts`, `server/tests/setup.ts`; create `server/vitest.unit.config.ts`, `server/tests/unit/test-database-target.test.ts`, `server/tests/helpers/test-database-target.ts`.

**Interface:** `validateTestDatabaseTarget(value: string): URL` accepts only an explicitly supplied local disposable database named `leadflow_test`; integration setup must never derive a destructive target from development configuration.

- [ ] Back up source/configuration files locally, excluding dependency trees, build archives and secrets. Record backup path.
- [ ] Add the missing parser at the same compatible major as the ESLint plugin. Keep the existing package manager and update the lockfile.
- [ ] Add a unit configuration without database global setup. Use `vitest run --config vitest.unit.config.ts` from `server`.
- [ ] Add and run failing target-guard cases, then implement the guard:

```ts
expect(() => validateTestDatabaseTarget('postgres://u:p@example.com/leadflow_test')).toThrow();
expect(() => validateTestDatabaseTarget('postgres://u:p@localhost/leadflow')).toThrow();
expect(validateTestDatabaseTarget('postgres://u:p@127.0.0.1/leadflow_test').pathname)
  .toBe('/leadflow_test');
```

- [ ] Require `TEST_DATABASE_URL`; retain the destructive reset only for that validated disposable target. Include Instagram/campaign tables in cleanup. Run database setup against a dedicated local instance, never the configured remote server.
- [ ] Run root lint, root tests and server unit tests. Fix actual lint errors rather than disabling rules globally.

## Task 2: Trust boundaries and readable errors

**Files:** modify `server/src/app.ts`, `server/src/lib/http.ts`, `server/src/routes/jobs.ts`, `server/src/config/env.ts`, `src/lib/api-client.ts`; create `server/src/lib/origin-policy.ts`, `server/tests/unit/origin-policy.test.ts`, `src/lib/api-client.test.ts`.

**Interfaces:** `isAllowedOrigin(origin: string | undefined, configured: string): boolean`; only exact normalized HTTP(S) origins in configuration may receive credentialed CORS headers. Requests without Origin retain normal token authorization.

- [ ] Reproduce arbitrary-origin acceptance with an HTTP test; include denied origins on error responses.

```ts
expect(isAllowedOrigin('https://attacker.invalid', 'https://app.example')).toBe(false);
expect(isAllowedOrigin('https://app.example.evil.invalid', 'https://app.example')).toBe(false);
expect(isAllowedOrigin('https://app.example', 'https://app.example')).toBe(true);
```

- [ ] Centralize CORS; remove route/error-handler header reflection and wildcard credential acceptance.
- [ ] Validate production encryption/JWT configuration without logging values. Preserve the existing encryption derivation so current ciphertext remains readable; document migration for key rotation.
- [ ] Add error-message regression test and prefer `message` when it is a string:

```ts
expect(new ApiError(503, { error: 'api_error', message: 'Source unavailable' }).message)
  .toBe('Source unavailable');
```

- [ ] Run affected tests and both TypeScript checks.

## Task 3: Remove fabricated production records

**Files:** modify `server/src/lib/places.ts`, `server/src/lib/crawler.ts`, `server/src/lib/audit-engine.ts`, `server/src/worker/scrape-worker.ts`; create `server/tests/unit/discovery-truthfulness.test.ts`, `server/tests/unit/enrichment-truthfulness.test.ts`; update fixture-dependent existing tests.

**Interfaces:** existing search returns actual records or an explicit error; an empty upstream result remains empty. Production enrichment only returns observed values. Fixtures move into test helpers, not source selection fallbacks.

- [ ] With network boundary mocked, assert empty results remain empty and transport failures reject:

```ts
await expect(searchPlaces(query)).rejects.toThrow(); // upstream failure case
expect((await searchPlaces(query)).places).toEqual([]); // valid empty response case
```

- [ ] Remove implicit fixture paths, generated email/social addresses and production mock-domain audit behavior. Make unavailable legacy paid sources return an explanatory disabled-source error under the free-only product configuration.
- [ ] Add worker-level rejection of synthetic records before persistence and preserve zero latitude/longitude with nullish checks.
- [ ] Add a non-destructive inspection command/report for identifiable historical fixtures. Do not classify arbitrary real records as fake based only on their names.
- [ ] Verify no failed production search can create a lead or start enrichment.

## Task 4: Free-source contracts and OSM data acquisition

**Files:** create `server/src/lib/discovery/types.ts`, `server/src/lib/discovery/osm.ts`, `server/src/lib/discovery/local-source.ts`, `server/src/lib/discovery/categories.ts`, `server/src/lib/discovery/service.ts`, `server/tests/unit/osm-discovery.test.ts`; modify `server/src/config/env.ts`, `server/src/routes/places.ts`, `src/api/places.ts`.

**Shared contract:**

```ts
export interface BusinessRecord {
  source: 'openstreetmap' | 'directory' | 'manual';
  sourceId: string;
  sourceUrl: string;
  observedAt: string;
  name: string;
  category?: string;
  address?: string;
  lat?: number;
  lng?: number;
  website?: string;
  phone?: string;
  email?: string;
  attribution: string;
}
export interface DiscoveryQuery {
  region: { type: 'radius'; center: { lat: number; lng: number }; radiusMeters: number }
    | { type: 'city'; query: string; countryCode?: string };
  categories: string[];
  limit: number;
}
export interface DiscoveryResult {
  records: BusinessRecord[];
  warnings: string[];
  truncated: boolean;
}
```

- [ ] Test normalization of node/way/relation records, stable IDs (`node/123`), missing contacts, international addresses, zero coordinates and unsafe URLs. Assert source name plus ID determines identity; names alone do not.
- [ ] Implement category-to-OSM-tag mapping and validated geographic bounds. Reject unknown categories explicitly. Do not send user-controlled query language to Overpass.
- [ ] Use explicit location selection for ambiguous city queries. Reuse bundled coordinates when available; configurable geocoding is optional and policy-limited. Never silently substitute San Francisco.
- [ ] Support a configured compatible endpoint and local open-data records; enforce bounded response size, timeout, server-wide concurrency and daily request/byte budgets. A missing source reports unavailable instead of creating fixtures.
- [ ] Prefer local regional data for commercial deployment. Add an operator import command accepting normalized JSONL with the above source contract; validate records and attribution before inserting into the source catalog. Raw PBF conversion remains an external documented preprocessing step.
- [ ] Verify 429 pauses, bounded retries, partial response warnings and Redis failure stopping network acquisition when its shared quota cannot be enforced.

## Task 5: Safe website enrichment and evidence

**Files:** create `server/src/lib/safe-fetch.ts`, `server/tests/unit/safe-fetch.test.ts`; modify `server/src/lib/crawler.ts`, `server/src/lib/audit-engine.ts`, `server/src/lib/browser-agent.ts`, `server/src/worker/enrich-worker.ts`.

**Interface:** `fetchPublicHtml(url: string, signal?: AbortSignal): Promise<{url: string; html: string}>` returns bounded public HTML or a typed failure. Any browser fallback must enforce the same destination policy on subresources and navigation, or remain disabled.

- [ ] Test rejection of loopback, RFC1918, link-local, IPv6 local/mapped addresses, URL credentials and non-HTTP schemes, including redirected destinations.
- [ ] Validate DNS results and pin the validated destination for the connection; validating and then independently resolving again is insufficient. Limit redirect count, total response bytes and elapsed time.
- [ ] Extract actual `mailto`/contact fields from observed pages, retain page URL and time, and respect robots policy and per-domain shared pacing. Never infer `info@domain`.
- [ ] Bound same-site contact-page traversal. Return incomplete enrichment with an error reason on blocks/timeouts rather than fabricated success.
- [ ] Run adversarial destination and extraction tests without reaching real private-network hosts.

## Task 6: Discovery persistence, jobs and UI integration

**Files:** create `server/migrations/1790208000000_lead_sources.sql`, `server/src/lib/discovery/persist.ts`, `server/tests/discovery.test.ts`; modify `server/src/worker/scrape-worker.ts`, `server/src/queue.ts`, `server/src/routes/leads.ts`, `server/src/routes/jobs.ts`, `server/src/lib/serialize.ts`, `src/types/lead.ts`, `src/api/jobs.ts`, `src/features/discovery/discovery-page.tsx`, `src/components/leads/provenance-badge.tsx`, `src/components/leads/lead-detail-drawer.tsx`.

**Storage contract:** `lead_sources(organization_id, provider, external_id, lead_id, source_url, observed_at, attribution)` with unique `(organization_id, provider, external_id)`. Use additive migrations and field-level evidence. Source catalog records are separate from tenant-owned lead records.

- [ ] Add concurrent duplicate-import integration test and separate-organization identity test. Use a transaction/unique constraint for source identity, not only in-memory matching.
- [ ] Route preview and extraction through the same discovery service; propagate the selected free source through API validation and queue payloads.
- [ ] Add authenticated cancellation; check cancellation between acquisition/persistence batches. Report discovered/imported/merged/rejected counts and bounded partial results.
- [ ] Stop detached enrichment tasks; queue enrichment jobs durably after lead persistence, with stable job identities.
- [ ] Replace paid-key/staging UI with source availability, location/category selection, previews, evidence links, warnings and genuine no-results/error states.
- [ ] Test preview-to-import, reload during a job, cancellation and provider failure in the browser.

## Task 7: Instagram schema and authenticated connection

**Files:** create `server/migrations/1790208001000_instagram_delivery.sql`, `server/src/lib/instagram/oauth-state.ts`, `server/tests/instagram-auth.test.ts`; modify `server/src/routes/instagram.ts`, `server/src/routes/instagram-webhook.ts`, `src/api/instagram.ts`, `src/features/instagram/instagram-page.tsx`.

**Interfaces:** OAuth state is random, short-lived, stored against authenticated user/organization, consumed once and required during callback. Event identity is scoped by connected account, event type and provider event ID.

- [ ] Reproduce fresh-schema failures for missing event columns/status values. Add missing columns and consistent status constraints in an additive migration.
- [ ] Create durable ingress/action/outbox tables with unique event/action identities; preserve historical events. If existing records prevent a new uniqueness constraint, retain history and deduplicate new actions in the new tables.
- [ ] Test OAuth state mismatch, expiry, replay and different-session use. Bind state to initiating user and organization and verify before exchanging a code.
- [ ] Remove hardcoded secrets/tokens; use configured secret only with timing-safe signature validation and a bounded raw-body parser. Test absent, malformed and wrong signatures.
- [ ] Verify fresh install and upgrade migration paths in the isolated database.

## Task 8: One durable Instagram execution path

**Files:** create `server/src/lib/instagram/events.ts`, `server/src/lib/instagram/outbox.ts`, `server/tests/instagram-events.test.ts`; modify `server/src/routes/instagram-webhook.ts`, `server/src/routes/instagram.ts`, `server/src/worker/ig-poller.ts`, `server/src/worker/ig-dm-worker.ts`, `server/src/lib/meta-graph.ts`, `server/src/queue.ts`.

**Interfaces:**

```ts
export interface InstagramEvent {
  accountId: string;
  sourceId: string;
  kind: 'comment' | 'message' | 'story_reply';
  recipientId: string;
  mediaId?: string;
  text: string;
}
// Resolves ownership from persisted account data, not a caller-supplied tenant.
export type IngestInstagramEvent = (event: InstagramEvent) => Promise<'accepted' | 'duplicate' | 'ignored'>;
```

- [ ] Test exact account/media matching and concurrent ingestion through webhook/poller/manual paths. Eliminate global account-count fallbacks and permissive media matching.
- [ ] Persist accepted events and outbox actions transactionally before webhook success. On storage failure return retryable failure; do not acknowledge and lose the event.
- [ ] Dispatch deterministic job IDs from the outbox with recovery after enqueue failure. All outbound actions go through workers, not request handlers or poller loops.
- [ ] At execution, reload account token, automation activity, organization ownership and action state. Do not embed credential snapshots in jobs.
- [ ] Record public reply and private-message outcomes independently. Check pause/disconnect before action. Retry only known safe transient rejections; ambiguous post-send network outcomes become explicit unknown/manual-review states.
- [ ] Apply per-account limits through shared Redis, preserve Retry-After and stop on invalid-token/permission errors. Do not count an existing public reply as DM delivery.
- [ ] Test queue recovery, duplicate inputs, wrong account, paused automation, disconnected account and uncertain provider response.

## Task 9: Supported Instagram capabilities and diagnostics

**Files:** modify `server/src/lib/meta-graph.ts`, `server/src/routes/instagram.ts`, `src/features/instagram/instagram-page.tsx`, `src/features/instagram/instagram-automation-modal.tsx`, `src/features/instagram/instagram-activity-panel.tsx`, `src/features/instagram/instagram-credentials-dialog.tsx`; create `server/tests/unit/instagram-capabilities.test.ts`.

- [ ] Verify current official Meta event and permission documentation for the chosen login flow before enabling each trigger. Capture verified API version and documentation links in setup documentation.
- [ ] Keep comment-to-DM and supported inbound message/story triggers. Disable follower automation unless the actual integration provides a documented eligible event and messaging permission.
- [ ] Expose connection/token state, webhook receipt time, permission/setup failures and action-level delivery status without returning secrets.
- [ ] Test the automation editor and activity history against queued, failed, unknown, ignored and sent states. Provide a local dry run that never transmits a message.

## Task 10: Persistent workspace settings

**Files:** create `server/src/routes/settings.ts`, `server/migrations/1790208002000_user_preferences.sql`, `server/tests/settings.test.ts`, `src/api/settings.ts`; modify `server/src/app.ts`, `src/App.tsx`, `src/features/settings/settings-page.tsx`, `src/api/auth.ts`.

**API contract:** `GET /settings` returns current user/workspace fields; `PATCH /settings/profile` updates display name/preferences; `PATCH /settings/organization` updates workspace name for owner/admin only. Password changes use the existing authenticated endpoint.

- [ ] Add tests for persistence, role rejection, other-tenant isolation, blank/oversized values and stale-session errors.
- [ ] Implement validated database writes; update auth/query caches from returned data.
- [ ] Replace timeout-based saves and success toasts with real mutations. Show notifications as preferences only when backed by an actual supported notification path; disable unsupported controls with clear copy.
- [ ] Verify save/reload and failed-save behavior in the browser.

## Task 11: Sequence execution and email reliability

**Files:** create `server/src/lib/sequences/advance.ts`, `server/src/worker/sequence-worker.ts`, `server/tests/sequences.test.ts`; modify `server/src/routes/sequences.ts`, `server/src/worker/send-worker.ts`, `server/src/worker/index.ts`, `server/src/index.ts`, `server/src/queue.ts`, `src/features/sequences/sequences-page.tsx`; add an additive execution/action migration.

**Interface:** scheduler claims due active enrollments using transactional row locks; advancing a step updates the enrollment and persists its outbound action atomically. Queue publication uses the durable outbox pattern. Send worker verifies tenant ownership, sender, suppression and current enrollment state.

- [ ] Test delay scheduling, terminal completion, duplicate ticks, suppression, reply-stop, pause/resume and invalid cross-tenant sender/template references.
- [ ] Validate typed step config before saving. Support delay, send-email and explicit conditions based on stored events. Reject undefined branch destinations/cycles instead of storing unexecutable graphs.
- [ ] Execute due steps under database claims. Re-check pause/suppression immediately before delivery; surface ambiguous SMTP outcomes rather than blind resend.
- [ ] Wire enrollment progress and controls to actual API state. Test concurrent schedulers and failure recovery with mocked SMTP transport.

## Task 12: Responsive product redesign

**Files:** modify `src/App.tsx`, `src/index.css`, `tailwind.config.ts`, existing feature pages and lead/campaign components; create `src/components/layout/app-shell.tsx`, `src/features/overview/overview-page.tsx`, `src/components/ui/page-state.tsx`.

- [ ] Load the frontend design skill at implementation time. Retain existing component primitives; define one coherent neutral palette/accent, spacing and typography scale.
- [ ] Build responsive navigation with Overview, Discover, Leads, Outreach, Automations and Settings. Preserve existing route deep links/redirects where names change.
- [ ] Overview reads real API aggregates and recent job activity. Never seed impressive metrics for appearance.
- [ ] Make discovery query/results, lead evidence, Instagram setup/rules/activity and persistent settings distinct readable flows.
- [ ] Add route-level lazy loading, accessible loading/error/empty states, labeled controls, keyboard focus, table overflow and mobile drawer navigation. Respect reduced motion.
- [ ] Inspect 390px, 768px and 1440px layouts with browser screenshots and exercise keyboard navigation. Check real API failures, long business names, empty accounts and expired sessions.

## Task 13: Release verification and deployment documentation

**Files:** modify Docker/Compose files, env examples and README; create `docs/production-readiness.md`, `docs/free-data-sources.md`, `docs/instagram-setup.md`; update this plan with evidence and unresolved external requirements.

- [ ] Establish explicit process ownership for workers/pollers; prevent duplicate in-process pollers across API replicas. Stop timers, browser contexts, queues and database clients during shutdown.
- [ ] Add readiness checks for required backing services and safe production configuration. Document backup/restore and migration commands without embedding credentials.
- [ ] Run the complete check set, recording exit status and counts:

```powershell
rtk npm run lint
rtk npm test -- --run
rtk npm run build
rtk npm run typecheck:server
rtk npm --prefix server run test:unit
rtk npm run test:server
```

- [ ] Run server integration tests only with the validated disposable local `TEST_DATABASE_URL`. If infrastructure is unavailable, report that exact gap; do not mark integration tests passed.
- [ ] Verify one complete free-source search/import/enrichment flow using allowed public data or a clearly identified local open-data extract. Distinguish fixture contract tests from real-source smoke tests.
- [ ] Verify Instagram locally with signed fixture events and mocked delivery. Real delivery remains explicitly unverified until an authorized test recipient and configured account are available.
- [ ] Review every acceptance criterion in the approved audit. List any unmet production dependencies; do not equate passing builds with production readiness.

## Execution choice

Recommended: **Native execution** in this task. Shared source/API/schema changes benefit from one implementer maintaining their contracts; the final review should independently inspect the integrated result. Subagent-driven execution is also available if the user prefers independent implementation/review at each task boundary.

No product implementation has started. This plan is the reviewable execution artifact required by the requested Superpowers workflow.
