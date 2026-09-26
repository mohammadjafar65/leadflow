-- up migration
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

-- down migration
drop table if exists lead_activities;
drop table if exists lead_tags;
drop table if exists tags;