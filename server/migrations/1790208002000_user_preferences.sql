-- up migration
alter table users add column if not exists display_name text not null default '';
alter table users add column if not exists preferences jsonb not null default '{}'::jsonb;
-- down migration
alter table users drop column if exists preferences;
alter table users drop column if exists display_name;
