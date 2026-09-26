-- up migration
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  sender_identity_id uuid not null references sender_identities(id),
  template_id uuid references templates(id) on delete set null,
  subject text not null,
  body_html text not null,
  delay_seconds int not null default 60, -- 1 min default (or custom delay)
  total_leads int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index idx_campaigns_org_status on campaigns(organization_id, status);
create index idx_campaigns_created on campaigns(created_at desc);

create table campaign_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'queued', 'sending', 'sent', 'failed', 'skipped')),
  personalized_subject text,
  personalized_body text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  error_message text,
  retry_count int not null default 0,
  unique (campaign_id, lead_id)
);

create index idx_campaign_leads_lookup on campaign_leads(campaign_id, status);
create index idx_campaign_leads_scheduled on campaign_leads(scheduled_at) where status in ('pending', 'queued');

-- down migration
drop table if exists campaign_leads;
drop table if exists campaigns;
