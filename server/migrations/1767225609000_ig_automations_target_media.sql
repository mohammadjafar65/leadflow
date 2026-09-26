-- up migration
alter table ig_automations add column if not exists target_media_id text;
alter table ig_automations add column if not exists target_media_url text;
alter table ig_automations add column if not exists target_media_caption text;

-- down migration
alter table ig_automations drop column if exists target_media_caption;
alter table ig_automations drop column if exists target_media_url;
alter table ig_automations drop column if exists target_media_id;
