import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn(),send:vi.fn(),add:vi.fn(),getJob:vi.fn(),remove:vi.fn()}));
vi.mock('../../src/db/pool.js',()=>({pool:{query:m.query}}));
vi.mock('../../src/db/redis.js',()=>({queueConnection:{},redis:{eval:async()=>1}}));
vi.mock('../../src/queue.js',()=>({igDmQueue:{add:m.add,getJob:m.getJob},enrichQueue:{add:vi.fn()}}));
vi.mock('../../src/lib/encrypt.js',()=>({decrypt:()=> 'test-token'}));
vi.mock('../../src/lib/meta-graph.js',()=>({sendDM:m.send,replyToComment:vi.fn(),GraphApiError:class extends Error{}}));
import { deliverInstagramEvent } from '../../src/worker/ig-dm-worker.js';
import { dispatchInstagramOutbox } from '../../src/lib/instagram/events.js';
beforeEach(()=>vi.clearAllMocks());
it('keeps a confirmed DM sent when recording the separate public reply outcome fails',async()=>{
 m.send.mockResolvedValue({messageId:'provider-receipt'});
 m.query.mockImplementation(async(sql:string)=>{
  if(sql.startsWith("update ig_deliveries set state='processing'"))return {rows:[{id:'event'}]};
  if(sql.startsWith('select e.*'))return {rows:[{is_active:true,ig_user_id:'account',page_access_token:'encrypted',trigger_type:'message'}]};
  if(sql.includes('public_state'))throw new Error('DB briefly unavailable');
  return {rows:[],rowCount:1};
 });
 await deliverInstagramEvent('event');
 expect(m.send).toHaveBeenCalledTimes(1);
 const states=m.query.mock.calls.filter(([sql])=>sql.startsWith('update ig_deliveries set state=$2')).map(([,args])=>args[1]);
 expect(states).toEqual(['sent']);
});
it('recreates a failed queue job when its database receipt was never claimed',async()=>{
 m.query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('select id from ig_deliveries')?[{id:'event'}]:[]}));
 m.getJob.mockResolvedValue({getState:async()=> 'failed',remove:m.remove});
 await dispatchInstagramOutbox();
 expect(m.remove).toHaveBeenCalledTimes(1);expect(m.add).toHaveBeenCalledWith('deliver',{eventId:'event'},expect.objectContaining({jobId:'event'}));
});
