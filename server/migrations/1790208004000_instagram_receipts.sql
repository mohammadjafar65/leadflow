-- up migration
-- Receipts survive rule deletion and account reconnection to avoid replaying sends.
alter table ig_deliveries drop constraint ig_deliveries_id_fkey;
alter table ig_deliveries add column external_account_id text;
update ig_deliveries d set external_account_id=a.ig_user_id from instagram_accounts a where d.account_id=a.id;
alter table ig_deliveries alter column external_account_id set not null;
alter table ig_deliveries drop constraint ig_deliveries_account_id_fkey;
alter table ig_deliveries alter column account_id drop not null;
alter table ig_deliveries add constraint ig_deliveries_account_id_fkey foreign key(account_id) references instagram_accounts(id) on delete set null;
create unique index ig_delivery_external_identity on ig_deliveries(external_account_id,kind,source_id);
create unique index instagram_account_single_workspace on instagram_accounts(ig_user_id);
-- down migration
drop index if exists instagram_account_single_workspace;
drop index if exists ig_delivery_external_identity;
alter table ig_deliveries drop column external_account_id;
