-- up migration
alter table ig_automation_events drop constraint if exists ig_automation_events_status_check;
alter table ig_automation_events add constraint ig_automation_events_status_check check (status in ('queued','processing','sent','failed','skipped','ignored','unknown'));
alter table ig_automation_events add column if not exists comment_text text;
alter table ig_automation_events add column if not exists media_id text;
alter table ig_automation_events add column if not exists media_url text;
alter table ig_automation_events add column if not exists action_taken text;
create table ig_deliveries (
 id uuid primary key references ig_automation_events(id) on delete cascade,
 account_id uuid not null references instagram_accounts(id) on delete cascade,
 source_id text not null,
 kind text not null,
 state text not null default 'queued' check (state in ('queued','processing','sent','failed','skipped','unknown')),
 public_state text not null default 'pending',
 message_id text,
 updated_at timestamptz not null default now(),
 unique (account_id,kind,source_id)
);
create table instagram_oauth_states (
 state_hash text primary key,
 user_id uuid not null references users(id) on delete cascade,
 organization_id uuid not null references organizations(id),
 origin text not null,
 expires_at timestamptz not null
);
-- down migration
drop table if exists instagram_oauth_states;
drop table if exists ig_deliveries;
