# LeadFlow — Technical Architecture Document

## 1. System Overview

```mermaid
flowchart LR
  subgraph Client
    FE[React + TS SPA]
  end
  subgraph Edge
    GW[API Gateway / Nginx]
  end
  subgraph AppLayer["Application Layer"]
    API[Node.js/Express API]
    WS[WebSocket Gateway<br/>(live scrape/send progress)]
  end
  subgraph Workers["Background Workers (BullMQ)"]
    SCRAPE[Scraper Worker]
    ENRICH[Enrichment Worker]
    SEND[Email Send Worker]
    SEQ[Sequence Scheduler]
  end
  subgraph Data
    PG[(PostgreSQL)]
    REDIS[(Redis: cache + queues)]
    S3[(Object storage: exports, raw HTML snapshots)]
  end
  subgraph External
    GMAPS[Google Maps/Places API]
    SMTP[SMTP/IMAP - Namecheap etc.]
    DNS[DNS-over-HTTPS resolver]
  end

  FE <--> GW --> API
  FE <-. live updates .-> WS
  API --> PG
  API --> REDIS
  API -- enqueue --> REDIS
  REDIS --> SCRAPE & ENRICH & SEND & SEQ
  SCRAPE --> GMAPS
  ENRICH --> S3
  SEND --> SMTP
  API --> DNS
  SCRAPE & ENRICH & SEND & SEQ --> PG
  Workers -. progress events .-> WS
```

**Rationale:** scraping and sending are long-running, rate-limited, and must survive API restarts — they run as separate queue-backed workers (BullMQ on Redis), not inline in request handlers. The API stays fast and stateless; horizontal scaling is just "add another worker/API replica."

## 2. Database Schema (PostgreSQL, core tables)

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  assigned_to uuid references users(id),
  name text not null,
  dba_names text[],
  category text,
  website text,
  phone_e164 text,
  address text,
  lat double precision,
  lng double precision,
  rating numeric(2,1),
  review_count int,
  domain text generated always as (
    lower(regexp_replace(website, '^https?://(www\.)?([^/]+).*$', '\2'))
  ) stored,
  stage text not null default 'new_lead'
    check (stage in ('new_lead','contacted','responded','qualified','closed','archived')),
  score int not null default 0,
  score_breakdown jsonb,
  merged_into uuid references leads(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_leads_org_stage on leads(organization_id, stage);
create index idx_leads_domain on leads(domain);
create index idx_leads_phone on leads(phone_e164);
create index idx_leads_geo on leads using gist (ll_to_earth(lat, lng)); -- requires earthdistance ext
create index idx_leads_search on leads using gin (
  to_tsvector('english', coalesce(name,'') || ' ' || coalesce(address,''))
);

create table enrichment_records (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  field text not null,             -- e.g. 'email', 'linkedin_url'
  value text not null,
  source text not null check (source in ('places_api','site_scrape','whois','manual')),
  confidence numeric(3,2) not null default 1.0,
  observed_at timestamptz not null default now()
);
create index idx_enrichment_lead on enrichment_records(lead_id);

create table tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  unique(organization_id, name)
);
create table lead_tags (
  lead_id uuid references leads(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (lead_id, tag_id)
);

create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  user_id uuid references users(id),
  type text not null,             -- stage_change, note, email_sent, email_opened, ...
  payload jsonb,
  created_at timestamptz not null default now()
);
create index idx_activities_lead on lead_activities(lead_id, created_at desc);

create table sender_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  display_name text not null,
  email_address text not null,
  smtp_host text not null,
  smtp_port int not null,
  smtp_username text not null,
  smtp_secret_encrypted bytea not null,   -- AES-256-GCM ciphertext
  imap_host text,
  imap_port int,
  daily_send_cap int not null default 50,
  domain_age_days int,
  created_at timestamptz not null default now()
);

create table templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  subject text not null,
  body_html text not null,
  variant_group uuid,              -- groups A/B variants together
  created_at timestamptz not null default now()
);

create table sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  industry_vertical text,
  is_template boolean not null default false
);

create table sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  step_order int not null,
  kind text not null check (kind in ('delay','condition','send_email','branch')),
  config jsonb not null    -- {delay_hours, timezone_aware} | {condition, on_true, on_false} | {template_id} ...
);

create table sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id),
  lead_id uuid not null references leads(id),
  sender_identity_id uuid not null references sender_identities(id),
  current_step int not null default 0,
  status text not null default 'active' check (status in ('active','completed','paused','cancelled')),
  next_action_at timestamptz,
  unique (sequence_id, lead_id)
);
create index idx_enrollments_due on sequence_enrollments(next_action_at) where status = 'active';

create table email_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references sequence_enrollments(id),
  lead_id uuid not null references leads(id),
  sender_identity_id uuid not null references sender_identities(id),
  type text not null check (type in ('sent','opened','clicked','replied','bounced','complained')),
  message_id text,
  created_at timestamptz not null default now()
);
create index idx_events_lead on email_events(lead_id, created_at desc);

create table suppression_list (
  organization_id uuid not null references organizations(id),
  email text not null,
  reason text not null check (reason in ('unsubscribed','hard_bounce','complaint','manual')),
  created_at timestamptz not null default now(),
  primary key (organization_id, email)
);
```

**Indexing strategy notes:** partial index on `sequence_enrollments.next_action_at` keeps the scheduler's "what's due" query cheap even at millions of historical rows. GIN full-text index backs the lead search bar. `earthdistance`/`cube` extension backs radius filtering without a separate geo database.

## 3. API Layer

- REST for CRUD (`/api/v1/leads`, `/api/v1/sequences`, ...), versioned from day one.
- WebSocket channel (`/ws/jobs/:jobId`) for live scrape/enrichment/send progress, so the UI doesn't poll.
- All mutating endpoints are idempotent where possible (client-supplied `Idempotency-Key` header, honored for 24h) — important because retried scrape/send requests must not duplicate leads or emails.
- Pagination: cursor-based (`?cursor=...&limit=50`), not offset — lead tables get large and offset pagination degrades.

## 4. Caching Strategy

- Redis cache for: Google Places category-taxonomy lookups (rarely changes, 24h TTL), DNS/SPF-DKIM-DMARC lookups (1h TTL, since DNS changes propagate slowly anyway), and computed lead-score components pending confirmation (invalidated on any enrichment write for that lead).
- No caching of lead list/detail data itself beyond normal HTTP cache-control for static assets — lead data changes too often (activity, score, stage) for a cache layer to pay off over just querying Postgres with good indexes.

## 5. Background Job Processing

- **Queue:** BullMQ on Redis. Separate queues per job type (`scrape`, `enrich`, `send`, `sequence-tick`) so a slow enrichment backlog never starves outbound sending.
- **Scraper worker:** pulls a search job, paginates Places API results, writes raw leads, enqueues one `enrich` job per lead with website URL.
- **Enrichment worker:** fetches robots.txt, checks crawl budget for that domain (Redis token bucket per-domain), fetches page(s), extracts email/social links via HTML parsing (not headless browser by default — falls back to a headless render only if the initial static fetch's DOM looks JS-rendered, to control cost).
- **Sequence scheduler (cron-tick, e.g. every minute):** selects `sequence_enrollments` where `next_action_at <= now()` and `status='active'`, evaluates the current step, enqueues `send` jobs or advances/branches the enrollment.
- **Send worker:** checks suppression list + daily cap for the sender identity before sending; writes `email_events(type='sent')`; on SMTP error classifies transient vs. permanent and retries/suppresses accordingly.

## 6. Security Architecture

- **AuthN:** JWT access token (short-lived, 15 min) + refresh token (httpOnly, secure cookie) rotation.
- **AuthZ:** RBAC (owner/admin/member) enforced at the API-route middleware layer; org-scoped row-level checks on every query (never trust a client-supplied `organization_id`).
- **Secrets at rest:** SMTP/IMAP credentials encrypted with AES-256-GCM, key sourced from a KMS (not stored alongside the ciphertext); credentials are decrypted only inside the send worker process, never returned to the frontend after initial save.
- **Transport:** TLS everywhere; SMTP connections use STARTTLS/implicit TLS depending on port (587/465).
- **PII handling:** enrichment records containing personal emails (as opposed to role-based `info@`/`contact@`) are flagged so retention/deletion policies (PRD §6) can target them specifically.
- **Audit log:** every export, bulk send, and credential change is written to an immutable `audit_log` table (append-only, no update/delete grants for the app role).
