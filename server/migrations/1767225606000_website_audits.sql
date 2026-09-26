-- up migration
create table if not exists website_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  lead_id uuid not null references leads(id) on delete cascade,
  website_url text not null,
  overall_score int not null default 0,
  qualification_score int not null default 0,
  is_icp boolean not null default true,
  scores jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  tech_stack jsonb not null default '[]'::jsonb,
  generated_email jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_audits_lead on website_audits(lead_id);
create index if not exists idx_audits_org on website_audits(organization_id);

-- down migration
drop table if exists website_audits;
