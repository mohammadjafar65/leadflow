import { expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),connect:vi.fn(),release:vi.fn(),send:vi.fn()}));
vi.mock('../../src/db/pool.js',()=>({pool:{connect:mocks.connect,query:mocks.query}}));
vi.mock('../../src/lib/mailer.js',()=>({dispatchEmail:mocks.send}));
import { advanceSequences } from '../../src/worker/sequence-worker.js';
it('leaves an already claimed delivery alone rather than pausing its enrollment',async()=>{
 mocks.connect.mockResolvedValue({query:mocks.query,release:mocks.release});
 mocks.query.mockImplementation(async(sql:string)=>{
  if(sql.includes('select e.*')) return {rows:[{id:'enrollment',sequence_id:'sequence',current_step:0}]};
  if(sql.includes('select * from sequence_steps')) return {rows:[{kind:'send_email',step_order:1,config:{template_id:'00000000-0000-4000-8000-000000000001'}}]};
  return {rows:[],rowCount:0};
 });
 await advanceSequences();
 expect(mocks.send).not.toHaveBeenCalled();
 expect(mocks.query.mock.calls.some(([sql])=>sql.startsWith("update sequence_enrollments set status='paused'"))).toBe(false);
});
