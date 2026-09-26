# LeadFlow — Implementation Roadmap

## Phased Plan

### Phase 0 — Foundations (1–2 weeks)
- Repo scaffolding, CI/CD, auth (org/user/RBAC), base DB schema, shadcn/ui theme setup.
- **Milestone:** a user can sign up, create an org, and see an empty pipeline shell.

### Phase 1 — Lead Discovery MVP (2–3 weeks)
- Google Maps/Places integration, region+category search, map preview, extraction job with rate limiting.
- Lead list view (no kanban/map yet), manual CSV export.
- **Milestone:** a real search produces real, deduplicated leads with name/address/phone/website populated from Places.

### Phase 2 — Enrichment & Pipeline (2–3 weeks)
- Website enrichment worker (email/social extraction, robots.txt/crawl-budget respecting), provenance badges.
- Full Kanban + Map views, filtering, tagging, lead scoring v1.
- **Milestone:** leads have enriched emails where available, and can be worked through pipeline stages.

### Phase 3 — Outreach Engine (Complete)
- Sender identity setup (Namecheap/SMTP/IMAP), template editor with variable injection, personalization brief generation.
- Automated email campaigns with 1-minute and custom time delays, delayed BullMQ queueing, pause/resume, and test sending.
- **Milestone:** a user can send personalized campaigns from their own domain to leads with configurable delay pacing.
### Phase 4 — Sequences & Automation (3–4 weeks)
- Visual sequence builder, scheduler worker, condition/branch logic, vertical templates, warmup schedules, suppression/bounce handling.
- A/B testing framework.
- **Milestone:** a multi-step sequence runs unattended end-to-end with correct branching and suppression.

### Phase 5 — Collaboration & Scale hardening (2–3 weeks)
- Team assignment, activity feed polish, bulk actions/exports, caching layer, load-testing the scraper/send queues, audit log.
- **Milestone:** two team members can work the same org's leads without stepping on each other; system holds up under a large (10k+ lead) org.

## Priority Matrix

| Feature | Impact | Effort | Priority |
|---|---|---|---|
| Maps search + extraction | High | Med | P0 |
| Deduplication | High | Med | P0 |
| Kanban pipeline | High | Low | P0 |
| Website enrichment (email/social) | High | High | P0 |
| Manual send + templates | High | Med | P0 |
| Deliverability dashboard | Med | Med | P1 |
| Sequence builder | High | High | P1 |
| A/B testing | Med | Med | P2 |
| Lead scoring v1 (rules-based) | Med | Low | P1 |
| Team collaboration/RBAC | Med | Med | P1 |
| WHOIS domain-age enrichment | Low | Low | P2 |
| Advanced ML-based scoring | Low | High | P3 (post-MVP) |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Google Places quota/cost blows up with global, uncapped searches | Hard per-org monthly search-credit cap; cost estimate shown before a large extraction job runs |
| Email deliverability tanks because new domains send too fast | Enforced warmup schedule (Phase 4) is a hard gate, not just a suggestion, for domains <90 days old |
| Legal exposure from scraping third-party sites at scale | Ship with robots.txt compliance + rate limiting from day one (not a later hardening pass); get an actual legal review before enabling scraping for EU-heavy target lists (see PRD §6) |
| Duplicate/merge logic corrupts send history | Merge is append-only under the hood (history preserved, "undo" always available) rather than destructive |
| Sequence branching logic has silent dead-ends | Builder validation blocks publishing a sequence with an undefined branch outcome |
| Team collaboration ships late and single-user assumption leaks into schema | `organization_id`/`assigned_to` are first-class on every table from Phase 0, even though multi-user UI ships in Phase 5 |
