-- up migration
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
create index idx_users_org on users(organization_id);

-- httpOnly refresh cookies (architecture.md §6): rotated on every refresh,
-- token stored hashed so a DB leak doesn't yield usable sessions.
create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by uuid references refresh_tokens(id),
  created_at timestamptz not null default now()
);
create index idx_refresh_tokens_user on refresh_tokens(user_id);

-- down migration
drop table if exists refresh_tokens;
drop table if exists users;
drop table if exists organizations;