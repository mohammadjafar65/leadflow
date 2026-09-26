-- up migration
alter table campaign_leads drop constraint campaign_leads_status_check;
alter table campaign_leads add constraint campaign_leads_status_check check(status in ('pending','queued','sending','sent','failed','skipped','unknown'));
alter table campaign_leads add column claimed_at timestamptz;
-- down migration
alter table campaign_leads drop column claimed_at;
