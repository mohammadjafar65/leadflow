-- up migration
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
create index idx_leads_geo on leads using gist (ll_to_earth(lat, lng));
create index idx_leads_search on leads using gin (
  to_tsvector('english', coalesce(name,'') || ' ' || coalesce(address,''))
);

-- keep updated_at honest
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;
create trigger trg_leads_updated_at before update on leads
  for each row execute function set_updated_at();

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

-- down migration
drop table if exists enrichment_records;
drop table if exists leads;
drop function if exists set_updated_at();