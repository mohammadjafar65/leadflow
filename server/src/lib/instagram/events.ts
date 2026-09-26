import { pool } from "../../db/pool.js";
import { igDmQueue, enrichQueue } from "../../queue.js";
import { matchesAutomation, type InstagramEvent } from "./policy.js";
export async function ingestInstagramEvent(event:InstagramEvent, automationId?:string):Promise<'accepted'|'duplicate'|'ignored'> {
 const client=await pool.connect();
 try {
  await client.query('begin');
  const {rows}=await client.query(`select a.*,ia.ig_user_id from ig_automations a join instagram_accounts ia on ia.id=a.instagram_account_id and ia.organization_id=a.organization_id where ia.ig_user_id=$1 and a.is_active=true and ($2::uuid is null or a.id=$2) order by a.created_at,a.id`,[event.accountId,automationId??null]);
  const rule=rows.find(r=>matchesAutomation(r,event));
  if(!rule) {await client.query('rollback'); return 'ignored';}
  await client.query('select pg_advisory_xact_lock(hashtext($1))',[`${event.accountId}:${event.kind}:${event.sourceId}`]);
  const existing=await client.query('select id from ig_deliveries where external_account_id=$1 and kind=$2 and source_id=$3',[event.accountId,event.kind,event.sourceId]);
  if(existing.rowCount) {await client.query('rollback');return 'duplicate';}
  // Historical sent/processing events must not be replayed after the upgrade.
  const historical=await client.query(`select e.id from ig_automation_events e join ig_automations a on a.id=e.automation_id where a.instagram_account_id=$1 and e.trigger_source_id=$2 and e.status in ('sent','processing','unknown') limit 1`,[rule.instagram_account_id,event.sourceId]);
  if(historical.rowCount) {await client.query('rollback');return 'duplicate';}
  const {rows:created}=await client.query(`insert into ig_automation_events (automation_id,organization_id,trigger_type,trigger_source_id,recipient_ig_id,recipient_username,status,comment_text,media_id,action_taken) values ($1,$2,$3,$4,$5,$6,'queued',$7,$8,'Queued') returning id`,[rule.id,rule.organization_id,event.kind,event.sourceId,event.recipientId,event.username??null,event.text,event.mediaId??null]);
  await client.query('insert into ig_deliveries (id,account_id,source_id,kind,external_account_id) values ($1,$2,$3,$4,$5)',[created[0].id,rule.instagram_account_id,event.sourceId,event.kind,event.accountId]);
  await client.query('commit'); return 'accepted';
 } catch(e) {await client.query('rollback');throw e;} finally {client.release();}
}
export async function dispatchInstagramOutbox():Promise<void> {
 const enrich=await pool.query("select lead_id,organization_id from enrichment_outbox where state='queued' limit 50");
 for(const row of enrich.rows) await enrichQueue.add('enrich',{leadId:row.lead_id,orgId:row.organization_id},{jobId:row.lead_id,attempts:2,backoff:{type:'exponential',delay:30000},removeOnComplete:{count:1000},removeOnFail:{count:1000}});
 await pool.query(`with expired as (update ig_deliveries set state='unknown',updated_at=now() where state='processing' and updated_at<now()-interval '5 minutes' returning id) update ig_automation_events set status='unknown',error_message='Delivery interrupted; verify on Instagram before retrying' where id in (select id from expired)`);
 const {rows}=await pool.query("select id from ig_deliveries where state='queued' order by updated_at limit 100");
 for(const row of rows) {
 const previous=await igDmQueue.getJob(row.id);
 if(previous && ['failed','completed'].includes(await previous.getState())) await previous.remove();
 await igDmQueue.add('deliver',{eventId:row.id},{jobId:row.id,attempts:1,removeOnComplete:{count:1000},removeOnFail:{count:1000}});
 }
}
