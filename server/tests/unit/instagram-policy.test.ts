import { it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, matchesAutomation, parseEvents } from "../../src/lib/instagram/policy.js";
it("only accepts the configured signing secret",()=>{
 const body=Buffer.from('{"object":"instagram"}'); const sig='sha256='+createHmac('sha256','configured').update(body).digest('hex');
 expect(verifyWebhookSignature(body,sig,'configured')).toBe(true);
 expect(verifyWebhookSignature(body,sig,'different')).toBe(false);
 expect(verifyWebhookSignature(body,'sha256=xx','configured')).toBe(false);
 expect(verifyWebhookSignature(body,sig,'')).toBe(false);
});
it("requires exact account and target media before matching keywords",()=>{
 const rule={ig_user_id:'account-1',trigger_type:'comment_to_dm',target_media_id:'media-1',keywords:['link']};
 const event={accountId:'account-1',sourceId:'c1',kind:'comment' as const,recipientId:'person',mediaId:'media-1',text:'LINK please'};
 expect(matchesAutomation(rule,event)).toBe(true);
 expect(matchesAutomation(rule,{...event,accountId:'other'})).toBe(false);
 expect(matchesAutomation(rule,{...event,mediaId:undefined})).toBe(false);
 expect(matchesAutomation(rule,{...event,recipientId:'account-1'})).toBe(false);
});
it("classifies story replies once and ignores echo events",()=>{
 const events=parseEvents({object:'instagram',entry:[{id:'account',messaging:[{sender:{id:'person'},message:{mid:'m1',text:'hi',reply_to:{story:{id:'s1'}}}},{sender:{id:'account'},message:{mid:'m2',text:'echo',is_echo:true}}]}]});
 expect(events).toHaveLength(1); expect(events[0].kind).toBe('story_reply');
});
