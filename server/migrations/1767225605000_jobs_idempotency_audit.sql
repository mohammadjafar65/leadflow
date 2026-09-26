-- up migration
-- Extraction/enrichment/send job tracking: the backing store for the
-- /ws/jobs/:jobId progress channel (architecture.md §3).
create table jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  created_by uuid references users(id),
  kind text not null check (kind in ('scrape','enrich','send','sequence-tick')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  params jsonb,
  result jsonb,
  error text,
  progress jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_jobs_org_kind on jobs(organization_id, kind, status);
create unique index idx_jobs_idem on jobs(organization_id, kind, idempotency_key)
  where idempotency_key is not null;

-- Idempotency-Key header support (architecture.md §3): retried mutating
-- requests replay the stored response for 24h instead of double-applying.
create table idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  key text not null,
  method text not null,
  path text not null,
  status_code int not null,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

-- Immutable audit log (architecture.md §6): exports, bulk sends, credential
-- changes. Append-only is enforced by triggers so even the app role cannot
-- UPDATE/DELETE rows; production should additionally use a least-privilege
-- role with only INSERT/SELECT grants on this table.
create table audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id),
  actor_user_id uuid references users(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_org on audit_log(organization_id, created_at desc);

create or replace function audit_log_append_only() returns trigger as $$
begin
  raise exception 'audit_log is append-only';
end; $$ language plpgsql;

create trigger trg_audit_log_no_update before update on audit_log
  for each row execute function audit_log_append_only();
create trigger trg_audit_log_no_delete before delete on audit_log
  for each row execute function audit_log_append_only();

-- down migration
drop table if exists audit_log;
drop function if exists audit_log_append_only();
drop table if exists idempotency_keys;
drop table if exists jobs;