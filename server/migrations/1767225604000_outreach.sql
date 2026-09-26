-- up migration
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
  step_index int,                  -- which sequence step produced this event
  type text not null check (type in ('sent','opened','clicked','replied','bounced','complained')),
  message_id text,
  created_at timestamptz not null default now()
);
create index idx_events_lead on email_events(lead_id, created_at desc);
-- reliability (PRD §4): a retried send job must never double-send a step
create unique index idx_events_sent_once on email_events(enrollment_id, step_index) where type = 'sent';

create table suppression_list (
  organization_id uuid not null references organizations(id),
  email text not null,
  reason text not null check (reason in ('unsubscribed','hard_bounce','complaint','manual')),
  created_at timestamptz not null default now(),
  primary key (organization_id, email)
);

-- down migration
drop table if exists suppression_list;
drop table if exists email_events;
drop table if exists sequence_enrollments;
drop table if exists sequence_steps;
drop table if exists sequences;
drop table if exists templates;
drop table if exists sender_identities;