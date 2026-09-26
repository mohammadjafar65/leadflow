import { Worker } from "bullmq";
import { pool } from "../db/pool.js";
import { queueConnection, redis } from "../db/redis.js";
import { decrypt } from "../lib/encrypt.js";
import { sendDM, replyToComment, GraphApiError } from "../lib/meta-graph.js";
export async function deliverInstagramEvent(eventId) {
    const { rows } = await pool.query(`update ig_deliveries set state='processing',updated_at=now() where id=$1 and state='queued' returning id`, [eventId]);
    if (!rows.length)
        return;
    const update = async (state, error, messageId) => {
        await pool.query('update ig_deliveries set state=$2,message_id=coalesce($3,message_id),updated_at=now() where id=$1', [eventId, state, messageId ?? null]);
        await pool.query("update ig_automation_events set status=$2,error_message=$3,sent_at=case when $2='sent' then now() else sent_at end,action_taken=$2 where id=$1", [eventId, state, error ?? null]);
    };
    let sending = false;
    let confirmed = false;
    try {
        const { rows: items } = await pool.query(`select e.*,a.is_active,a.message_template,a.link_url,a.button_label,a.comment_reply_template,ia.page_access_token,ia.ig_user_id,ia.token_expires_at from ig_automation_events e join ig_automations a on a.id=e.automation_id and a.organization_id=e.organization_id join instagram_accounts ia on ia.id=a.instagram_account_id and ia.organization_id=e.organization_id where e.id=$1`, [eventId]);
        const item = items[0];
        if (!item || !item.is_active) {
            await update('skipped', 'Automation paused or disconnected');
            return;
        }
        if (item.token_expires_at && new Date(item.token_expires_at) < new Date()) {
            await update('failed', 'Reconnect Instagram: token expired');
            return;
        }
        const count = Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],90000) end; return n", 1, `ig:daily:${item.ig_user_id}:${new Date().toISOString().slice(0, 10)}`));
        if (count > 100) {
            await update('skipped', 'Workspace safety limit reached for this Instagram account today');
            return;
        }
        const token = decrypt(item.page_access_token);
        sending = true;
        const sent = await sendDM(token, item.ig_user_id, item.recipient_ig_id, item.message_template, item.link_url, item.button_label, item.trigger_type === 'comment' ? item.trigger_source_id : null);
        await update('sent', undefined, sent.messageId);
        confirmed = true;
        sending = false;
        if (item.trigger_type === 'comment' && item.comment_reply_template?.trim()) {
            try {
                const reply = await replyToComment(token, item.trigger_source_id, item.comment_reply_template);
                await pool.query('update ig_deliveries set public_state=$2 where id=$1', [eventId, reply ? 'sent' : 'unknown']);
            }
            catch {
                await pool.query("update ig_deliveries set public_state='unknown' where id=$1", [eventId]);
            }
        }
        else
            await pool.query("update ig_deliveries set public_state='skipped' where id=$1", [eventId]);
    }
    catch (error) {
        if (confirmed) {
            console.error('[instagram-public-reply] Unable to persist public reply status for', eventId);
            return;
        }
        const status = sending && !(error instanceof GraphApiError) ? 'unknown' : 'failed';
        await update(status, error instanceof Error ? error.message : 'Delivery failed');
    }
}
export function startIgDmWorker() {
    const worker = new Worker('ig-dm', job => deliverInstagramEvent(job.data.eventId), { connection: queueConnection, concurrency: 1 });
    worker.on('error', e => console.error('[instagram-worker]', e.message));
    return worker;
}
//# sourceMappingURL=ig-dm-worker.js.map