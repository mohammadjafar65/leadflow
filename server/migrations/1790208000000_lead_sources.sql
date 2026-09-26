-- up migration
create table lead_sources (
  organization_id uuid not null references organizations(id),
  provider text not null,
  external_id text not null,
  lead_id uuid not null references leads(id) on delete cascade,
  source_url text not null,
  observed_at timestamptz not null default now(),
  attribution text not null,
  primary key (organization_id, provider, external_id)
);
alter table enrichment_records drop constraint if exists enrichment_records_source_check;
alter table enrichment_records add constraint enrichment_records_source_check check (source in ('places_api','site_scrape','whois','manual','openstreetmap','directory'));
alter table enrichment_records add column source_url text;
create table enrichment_outbox (
 lead_id uuid primary key references leads(id) on delete cascade,
 organization_id uuid not null references organizations(id),
 state text not null default 'queued',
 error text,
 updated_at timestamptz not null default now()
);

-- down migration
drop table if exists enrichment_outbox;
alter table enrichment_records drop column if exists source_url;
drop table if exists lead_sources;
