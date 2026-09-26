-- ─── Instagram Auto DM ───────────────────────────────────────────────────────
-- Stores connected IG Business accounts, automation rules, and event audit log.

-- Connected Instagram Business accounts (one per IG page per org)
create table instagram_accounts (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  ig_user_id        text not null,                -- Meta IG User / Page ID
  username          text not null,                -- e.g. "yourbrand"
  page_access_token text not null,               -- AES-256-GCM encrypted
  token_expires_at  timestamptz,                  -- null = never (long-lived)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, ig_user_id)
);

create index idx_instagram_accounts_org on instagram_accounts(organization_id);

-- Automation rules
create table ig_automations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  instagram_account_id uuid not null references instagram_accounts(id) on delete cascade,
  name              text not null,
  trigger_type      text not null check (trigger_type in (
                      'comment_to_dm',
                      'story_reply',
                      'keyword_dm',
                      'new_follower'
                    )),
  keywords          text[],                       -- for comment_to_dm / keyword_dm
  message_template  text not null,
  link_url          text,                         -- optional link appended to message
  button_label      text,                         -- optional button CTA text (e.g. "Open Link", "Download App")
  comment_reply_template text,                    -- optional public reply to the comment (e.g. "I have sent Link, Please check your DM!")
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_ig_automations_org     on ig_automations(organization_id);
create index idx_ig_automations_account on ig_automations(instagram_account_id);
create index idx_ig_automations_active  on ig_automations(instagram_account_id, is_active);

-- Audit log of every triggered DM attempt
create table ig_automation_events (
  id                uuid primary key default gen_random_uuid(),
  automation_id     uuid not null references ig_automations(id) on delete cascade,
  organization_id   uuid not null,
  trigger_type      text not null,
  trigger_source_id text,                         -- comment ID, message ID, etc.
  recipient_ig_id   text not null,
  recipient_username text,
  status            text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  error_message     text,
  queued_at         timestamptz not null default now(),
  sent_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index idx_ig_events_automation on ig_automation_events(automation_id, created_at desc);
create index idx_ig_events_org        on ig_automation_events(organization_id, created_at desc);
