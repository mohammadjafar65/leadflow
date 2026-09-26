import crypto from "node:crypto";
export interface InstagramEvent { accountId:string;sourceId:string;kind:'comment'|'message'|'story_reply';recipientId:string;username?:string;mediaId?:string;text:string }
export function verifyWebhookSignature(body:Buffer,signature:string|undefined,secret:string):boolean {
 if(!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
 return crypto.timingSafeEqual(crypto.createHmac('sha256',secret).update(body).digest(),Buffer.from(signature.slice(7),'hex'));
}
export function matchesAutomation(rule:{ig_user_id:string;trigger_type:string;target_media_id?:string|null;keywords?:string[]|null},event:InstagramEvent):boolean {
 if(rule.ig_user_id!==event.accountId || event.recipientId===event.accountId) return false;
 const trigger=event.kind==='comment'?'comment_to_dm':event.kind==='message'?'keyword_dm':'story_reply';
 if(rule.trigger_type!==trigger || rule.target_media_id && rule.target_media_id!==event.mediaId) return false;
 return !rule.keywords?.length || rule.keywords.some(k=>event.text.toLocaleLowerCase().includes(k.toLocaleLowerCase()));
}
type Payload={object?:string;entry?:Array<{id:string;changes?:Array<{field:string;value:{id?:string;text?:string;from?:{id:string;username?:string};media?:{id:string}}}>;messaging?:Array<{sender?:{id:string};message?:{mid?:string;text?:string;is_echo?:boolean;reply_to?:{story?:{id:string}}}}>}>};
export function parseEvents(payload:Payload):InstagramEvent[] {
 if(payload.object!=='instagram' && payload.object!=='page') return [];
 const result:InstagramEvent[]=[];
 for(const entry of payload.entry??[]) {
  for(const change of entry.changes??[]) { const v=change.value; if(change.field==='comments' && v.id && v.from?.id && typeof v.text==='string') result.push({accountId:entry.id,sourceId:v.id,kind:'comment',recipientId:v.from.id,username:v.from.username,mediaId:v.media?.id,text:v.text}); }
  for(const item of entry.messaging??[]) { const m=item.message; if(m?.mid && !m.is_echo && item.sender?.id && typeof m.text==='string') result.push({accountId:entry.id,sourceId:m.mid,kind:m.reply_to?.story?'story_reply':'message',recipientId:item.sender.id,mediaId:m.reply_to?.story?.id,text:m.text}); }
 }
 return result;
}
