# LeadFlow

SaaS lead-generation & outreach platform: Google Maps business discovery → enrichment → pipeline → personalized email sequences.

## Docs (start here)

- [`docs/PRD.md`](docs/PRD.md) — functional/non-functional requirements, personas, data model, compliance
- [`docs/design.md`](docs/design.md) — design system, component inventory, page flows
- [`docs/architecture.md`](docs/architecture.md) — system diagram, DB schema, security
- [`docs/roadmap.md`](docs/roadmap.md) — phased plan, priority matrix, risks

**Read the PRD's §6 Compliance section before wiring up real scraping or sending** — it flags CAN-SPAM, GDPR, Google Places ToS, and website-scraping legal considerations that affect implementation choices, not just legal copy.

## Project structure

```
.
├── docs/                      PRD, design, architecture, roadmap
├── server/                    Express API + BullMQ workers (Node 20+)
│   ├── migrations/            SQL migrations (node-pg-migrate, epoch-ms filenames)
│   ├── scripts/               migrate runner + creator
│   ├── src/
│   │   ├── config/            zod-validated env
│   │   ├── db/                pg pool
│   │   ├── lib/               jwt/refresh rotation, http errors, idempotency
│   │   ├── middleware/        auth (JWT), RBAC, org-scoped guards
│   │   ├── routes/            per-resource routers
│   │   └── worker/            BullMQ workers (scrape/enrich/send/sequence)
│   └── tests/                 vitest + supertest against a real Postgres
├── docker-compose.yml         postgres + redis + api + worker + web
├── .env.example               frontend + server env template
└── src/                       React SPA (Vite, shadcn-style tokens)
    ├── types/                 Lead, Sequence, SenderIdentity, etc.
    ├── lib/
    │   ├── api-client.ts      fetch wrapper w/ token + refresh-on-401
    │   ├── lead-scoring.ts    rules-based scorer (PRD FR-2.4)
    │   └── utils.ts           cn(), phone/domain normalization
    ├── api/                   one file per resource (auth, leads, ...)
    ├── store/                 zustand — UI/filter state only, not server data
    ├── components/
    │   ├── ui/                shadcn primitives (Badge, Card, Tooltip, ...)
    │   ├── leads/             KanbanBoard, ScoreRing, ProvenanceBadge
    │   ├── auth/              login/signup pages
    │   └── outreach/          template editor, variable picker (stub)
    ├── features/              feature folders (pipeline, discovery, ...)
    └── hooks/                 shared hooks (useLeads, useWebSocketJob, ...)
```

**Server data lives in React Query, not zustand** — `useLeadsStore` only holds view/filter/selection UI state, so there's a single source of truth for lead records.

## Getting started

```bash
# 1. Postgres + Redis (Docker)
docker compose up -d postgres redis

# 2. Env files
cp .env.example .env                     # frontend (VITE_*)
cp server/.env.example server/.env        # backend — fill in secrets

# 3. Migrations + deps
npm install
npm --prefix server install
npm run migrate

# 4. Run
npm run dev:api       # API on :4000 (separate terminal)
npm run dev:worker    # BullMQ workers (separate terminal)
npm run dev           # Vite SPA on :5173
```

> **On this dev machine** the host already runs Postgres on :5432 and Redis on :6379, so LeadFlow's Postgres container maps to **:5433** (see `docker-compose.override.yml`) and `server/.env` uses port 5433. On a stock machine, drop the override file and use 5432.

### Google Places (Phase 1)

Places calls go through the server-side proxy at `/api/v1/places/*` (never from the browser). With `GOOGLE_MAPS_SERVER_API_KEY` empty and `GOOGLE_PLACES_STAGING=true`, the proxy serves a clearly-labeled staging fixture source so the whole extract → dedup → pipeline flow is testable without a key or quota spend. Set the key in `server/.env` to switch to the real API with no code changes.

## Testing

```bash
npm test               # frontend unit tests (vitest)
npm run test:server    # server integration tests (needs Postgres; uses leadflow_test DB)
npm run lint
npm run build
```

Server tests run against a real Postgres — the global setup creates/uses the `leadflow_test` database and applies migrations automatically.

## Phase status

| Phase | Status |
|---|---|
| 0 — Foundations (auth, RBAC, schema, shell) | ✅ Implemented |
| 1 — Lead Discovery MVP (Places proxy, scrape worker, dedup, Discovery UI, Pipeline live, WS progress) | ✅ Implemented |
| 2 — Enrichment & Pipeline (enrich worker, tag routes, map view, score range filter) | 🔄 In progress |
| 3 — Outreach Engine (SMTP identities, templates, campaigns, send worker) | ✅ UI + routes built — send worker pending |
| 4 — Sequences & Automation (sequence builder, scheduler worker, enrollment) | ✅ UI + routes built — scheduler worker pending |
| 5 — Collaboration & Hardening (team management, bulk actions, audit log) | Planned |