import { pool } from "../db/pool.js";
import { redis } from "../db/redis.js";
import { decrypt } from "../lib/encrypt.js";
import { getMediaComments, getAccountMedia } from "../lib/meta-graph.js";
import { ingestInstagramEvent, dispatchInstagramOutbox } from "../lib/instagram/events.js";
let timer:NodeJS.Timeout|undefined;
export async function processActiveInstagramAutomations(organizationId?:string,automationId?:string) {
 let processedComments=0;let repliedCount=0;
 const {rows}=await pool.query(`select a.*,ia.ig_user_id,ia.page_access_token from ig_automations a join instagram_accounts ia on ia.id=a.instagram_account_id and ia.organization_id=a.organization_id where a.is_active=true and a.trigger_type='comment_to_dm' and ($1::uuid is null or a.organization_id=$1) and ($2::uuid is null or a.id=$2)`,[organizationId??null,automationId??null]);
 for(const rule of rows) {
  const acquired=await redis.set(`ig:poll:${rule.id}`,'1','EX',120,'NX');if(!acquired) continue;
  const token=decrypt(rule.page_access_token);
  const media=rule.target_media_id?[{id:rule.target_media_id}]:await getAccountMedia(token,rule.ig_user_id,10);
  for(const post of media) {
   const comments=await getMediaComments(token,post.id);
   for(const comment of comments) {
    if(!comment.from?.id || !comment.text || new Date(comment.timestamp)<new Date(rule.created_at)) continue;
    processedComments++;
    const outcome=await ingestInstagramEvent({accountId:rule.ig_user_id,sourceId:comment.id,kind:'comment',recipientId:comment.from.id,username:comment.from.username,mediaId:post.id,text:comment.text},rule.id);
    if(outcome==='accepted') repliedCount++;
   }
  }
 }
 return {checkedAutomations:rows.length,processedComments,repliedCount};
}
export function startIgCommentPoller() {
 // Webhooks are primary. Periodic work dispatches durable events; manual sync uses the same ingestion path.
 const tick=()=>void dispatchInstagramOutbox().catch(e=>console.error('[ig-outbox]',e.message));
 timer=setInterval(tick,5000);timer.unref();tick();
}
export function stopIgCommentPoller(){if(timer)clearInterval(timer);timer=undefined;}
