import { pool } from '../db/pool.js';
import { dispatchEmail, type SenderIdentityRow } from '../lib/mailer.js';
import { nextStep, parseStepConfig } from '../lib/sequences/advance.js';
let timer:NodeJS.Timeout|undefined;let busy=false;
export async function advanceSequences(){
 if(busy)return;busy=true;
 let client;
 try { client=await pool.connect(); } catch(error) { busy=false; throw error; }
 try {
  await client.query(`with stale as (update sequence_actions set state='unknown',error='Worker interrupted; review delivery before resuming' where state='processing' and updated_at<now()-interval '5 minutes' returning enrollment_id) update sequence_enrollments set status='paused' where id in (select enrollment_id from stale)`);
  await client.query('begin');
  const {rows}=await client.query(`select e.*,s.organization_id from sequence_enrollments e join sequences s on s.id=e.sequence_id where e.status='active' and not exists (select 1 from sequence_actions a where a.enrollment_id=e.id and a.state in ('processing','unknown','failed','skipped')) and coalesce(e.next_action_at,now())<=now() order by e.next_action_at nulls first for update of e skip locked limit 1`);
  const enrollment=rows[0];if(!enrollment){await client.query('commit');return;}
  const {rows:steps}=await client.query('select * from sequence_steps where sequence_id=$1 and step_order>$2 order by step_order limit 1',[enrollment.sequence_id,enrollment.current_step]);
  const step=steps[0];
  const reply=await client.query("select id from email_events where enrollment_id=$1 and type in ('replied','bounced','complained') limit 1",[enrollment.id]);
  if(!step || reply.rowCount){await client.query("update sequence_enrollments set status='completed' where id=$1",[enrollment.id]);await client.query('commit');return;}
  const config=parseStepConfig(step.kind,step.config,step.step_order);
  if(step.kind==='delay'){
   await client.query("update sequence_enrollments set current_step=$2,next_action_at=now()+make_interval(secs=>$3) where id=$1",[enrollment.id,step.step_order,Number(config.delay_hours)*3600]);await client.query('commit');return;
  }
  if(step.kind==='condition'||step.kind==='branch'){
   const result=await client.query('select id from email_events where enrollment_id=$1 and type=$2 limit 1',[enrollment.id,config.condition]);
   await client.query('update sequence_enrollments set current_step=$2,next_action_at=now() where id=$1',[enrollment.id,nextStep(step.step_order,config,!!result.rowCount)-1]);await client.query('commit');return;
  }
  const claimed=await client.query("insert into sequence_actions (enrollment_id,step_order,state) values ($1,$2,'processing') on conflict do nothing returning enrollment_id",[enrollment.id,step.step_order]);
  if(!claimed.rowCount){await client.query('commit');return;}
  const {rows:templates}=await client.query('select * from templates where id=$1 and organization_id=$2',[config.template_id,enrollment.organization_id]);
  const {rows:identities}=await client.query('select * from sender_identities where id=$1 and organization_id=$2',[enrollment.sender_identity_id,enrollment.organization_id]);
  const {rows:leads}=await client.query("select l.*, (select value from enrichment_records where lead_id=l.id and field='email' order by observed_at desc limit 1) as email from leads l where id=$1 and organization_id=$2",[enrollment.lead_id,enrollment.organization_id]);
  await client.query('commit');
  const lead=leads[0],template=templates[0],identity=identities[0] as SenderIdentityRow|undefined;
  const current=await pool.query("select status from sequence_enrollments where id=$1",[enrollment.id]);
  const result=current.rows[0]?.status!=='active'?{status:'skipped',error:'Enrollment paused'}:!lead?.email||!template||!identity?{status:'failed',error:'Missing email, template or sender'}:await dispatchEmail({identity,recipientEmail:lead.email,subject:template.subject,bodyHtml:template.body_html,lead});
  await client.query('begin');
  await client.query('update sequence_actions set state=$3,error=$4,updated_at=now() where enrollment_id=$1 and step_order=$2',[enrollment.id,step.step_order,result.status,result.error??null]);
  if(result.status==='sent'){
   await client.query("insert into email_events (enrollment_id,lead_id,sender_identity_id,step_index,type,message_id) values ($1,$2,$3,$4,'sent',$5) on conflict do nothing",[enrollment.id,enrollment.lead_id,enrollment.sender_identity_id,step.step_order,'messageId' in result?result.messageId:null]);
   await client.query('update sequence_enrollments set current_step=$2,next_action_at=now() where id=$1',[enrollment.id,step.step_order]);
  } else await client.query("update sequence_enrollments set status='paused' where id=$1",[enrollment.id]);
  await client.query('commit');
 } catch(e){await client.query('rollback');throw e;}finally{client.release();busy=false;}
}
export function startSequenceScheduler(){timer=setInterval(()=>void advanceSequences().catch(e=>console.error('[sequences]',e.message)),5000);timer.unref();}
export function stopSequenceScheduler(){if(timer)clearInterval(timer);}
