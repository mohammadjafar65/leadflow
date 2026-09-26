import { Worker, type Job } from "bullmq";
import { pool } from "../db/pool.js";
import { queueConnection } from "../db/redis.js";
import { dispatchEmail, type SenderIdentityRow } from "../lib/mailer.js";

export const SEND_QUEUE_NAME = "send";

export interface SendCampaignJobData {
  campaignId: string;
  campaignLeadId: string;
  leadId: string;
  recipientEmail: string;
}

export async function executeCampaignLeadSend(data:SendCampaignJobData,job?:Job<SendCampaignJobData>):Promise<void> {
 const client=await pool.connect(); let locked=false;
 try {
  const result=await client.query('select pg_try_advisory_lock(hashtext($1)) as locked',['campaign:'+data.campaignId]);
  locked=Boolean(result.rows[0]?.locked); if(!locked) return;
  await executeClaimedCampaignLeadSend(data,job);
 } finally { try { if(locked) await client.query('select pg_advisory_unlock(hashtext($1))',['campaign:'+data.campaignId]); } finally { client.release(); } }
}

async function executeClaimedCampaignLeadSend(
  data: SendCampaignJobData,
  job?: Job<SendCampaignJobData>,
): Promise<void> {
  const { campaignId, campaignLeadId, leadId, recipientEmail } = data;

  // 1. Fetch Campaign and check its status
  const campaignRes = await pool.query(
    `select id, organization_id, name, status, sender_identity_id, subject, body_html, delay_seconds
     from campaigns where id = $1`,
    [campaignId],
  );
  const campaign = campaignRes.rows[0];
  if (!campaign) {
    console.warn(`[send-worker] Campaign ${campaignId} not found, skipping job.`);
    return;
  }

  if (campaign.status === "cancelled") {
    await pool.query(
      "update campaign_leads set status = 'skipped', error_message = 'Campaign was cancelled' where id = $1 and campaign_id=$2 and status in ('pending','queued')",
      [campaignLeadId,campaignId],
    );
    return;
  }

  if (campaign.status === "paused") {
    console.log(`[send-worker] Campaign ${campaignId} is paused. Postponing send for lead ${leadId}.`);
    if (job && typeof job.moveToDelayed === "function") {
      try {
        await job.moveToDelayed(Date.now() + 15000, job.token);
      } catch {
        // ignore
      }
    }
    return;
  }

  if(campaign.status !== 'running') return;

  // Check lead status to prevent double-sends
  const leadStatusRes = await pool.query(
    "select status, scheduled_at from campaign_leads where id = $1 and campaign_id=$2 and lead_id=$3 and recipient_email=$4",
    [campaignLeadId,campaignId,leadId,recipientEmail],
  );
  const currentLead = leadStatusRes.rows[0];
  if (!currentLead || !["pending","queued"].includes(currentLead.status) || currentLead.scheduled_at && new Date(currentLead.scheduled_at).getTime()>Date.now()) {
    return;
  }

  // If this was called via BullMQ (status is not yet 'sending'), ensure cooldown is honored
  if (currentLead.status !== "sending") {
    const delaySeconds = Math.max(5, campaign.delay_seconds || 60);
    const lastSentRes = await pool.query(
      `select max(sent_at) as last_sent_at from campaign_leads where campaign_id = $1 and status = 'sent'`,
      [campaignId],
    );
    const lastSentAt = lastSentRes.rows[0]?.last_sent_at;
    if (lastSentAt) {
      const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
      const requiredCooldownMs = delaySeconds * 1000;
      if (elapsedMs < requiredCooldownMs) {
        return;
      }
    }

    // Atomically claim
    const claim = await pool.query(
      "update campaign_leads set status = 'sending', claimed_at=now() where id = $1 and status in ('pending', 'queued') returning id",
      [campaignLeadId],
    );
    if (claim.rowCount === 0) return;
  }

  // 2. Fetch Sender Identity
  const identityRes = await pool.query(
    `select id, organization_id, display_name, email_address, smtp_host, smtp_port,
            smtp_username, smtp_secret_encrypted, daily_send_cap
     from sender_identities where id = $1 and organization_id=$2`,
    [campaign.sender_identity_id,campaign.organization_id],
  );
  const identity = identityRes.rows[0] as SenderIdentityRow | undefined;
  if (!identity) {
    await pool.query(
      "update campaign_leads set status = 'failed', error_message = 'Sender identity not found' where id = $1",
      [campaignLeadId],
    );
    await pool.query("update campaigns set failed_count = failed_count + 1 where id = $1", [campaignId]);
    return;
  }

  // 3. Fetch Lead Details
  const leadRes = await pool.query(
    "select id, name, website, phone_e164, address, category, stage from leads where id = $1 and organization_id=$2",
    [leadId,campaign.organization_id],
  );
  const lead = leadRes.rows[0];
  if (!lead) {
    await pool.query(
      "update campaign_leads set status = 'failed', error_message = 'Lead record not found' where id = $1",
      [campaignLeadId],
    );
    await pool.query("update campaigns set failed_count = failed_count + 1 where id = $1", [campaignId]);
    return;
  }

  // Mark status as sending if not already set
  await pool.query("update campaign_leads set status = 'sending' where id = $1", [campaignLeadId]);

  // 4. Dispatch the email
  const sendResult = await dispatchEmail({
    identity,
    recipientEmail,
    subject: campaign.subject,
    bodyHtml: campaign.body_html,
    lead: {
      id: lead.id,
      name: lead.name,
      website: lead.website,
      phoneE164: lead.phone_e164,
      address: lead.address,
      category: lead.category,
      email: recipientEmail,
    },
    campaignId,
    campaignLeadId,
  });

  // 5. Update states according to result
  if (sendResult.status === "sent") {
    // Record email event
    await pool.query(
      `insert into email_events (lead_id, sender_identity_id, type, message_id)
       values ($1, $2, 'sent', $3)`,
      [leadId, identity.id, sendResult.messageId ?? null],
    );

    // Record lead activity
    await pool.query(
      `insert into lead_activities (lead_id, type, payload)
       values ($1, 'email_sent', $2::jsonb)`,
      [
        leadId,
        JSON.stringify({
          campaignId,
          campaignName: campaign.name,
          recipient: recipientEmail,
          subject: campaign.subject,
          simulated: sendResult.simulated ?? false,
        }),
      ],
    );

    // Update campaign lead status
    await pool.query(
      "update campaign_leads set status = 'sent', sent_at = now(), error_message = null where id = $1",
      [campaignLeadId],
    );

    // Increment campaign sent count
    await pool.query("update campaigns set sent_count = sent_count + 1 where id = $1", [campaignId]);

    // Automatically transition lead from new_lead to contacted
    if (lead.stage === "new_lead") {
      await pool.query(
        "update leads set stage = 'contacted', updated_at = now() where id = $1 and stage = 'new_lead'",
        [leadId],
      );
    }
  } else if (sendResult.status === "skipped") {
    await pool.query(
      "update campaign_leads set status = 'skipped', error_message = $2 where id = $1",
      [campaignLeadId, sendResult.error ?? "Skipped"],
    );
  } else if(sendResult.status==='unknown') {
    await pool.query("update campaign_leads set status='unknown',error_message=$2 where id=$1",[campaignLeadId,sendResult.error]);
  } else {
    // Failed
    await pool.query(
      "update campaign_leads set status = 'failed', error_message = $2, retry_count = retry_count + 1 where id = $1",
      [campaignLeadId, sendResult.error ?? "Sending failed"],
    );
    await pool.query("update campaigns set failed_count = failed_count + 1 where id = $1", [campaignId]);
  }

  // 6. Check if campaign is now complete
  const remainingRes = await pool.query(
    `select count(*) as count from campaign_leads
     where campaign_id = $1 and status in ('pending', 'queued', 'sending')`,
    [campaignId],
  );
  const remainingCount = Number(remainingRes.rows[0]?.count ?? 0);
  if (remainingCount === 0) {
    await pool.query(
      "update campaigns set status = 'completed', completed_at = now() where id = $1 and status = 'running'",
      [campaignId],
    );
    console.log(`[send-worker] Campaign ${campaignId} (${campaign.name}) completed.`);
  }
}

export async function processSendCampaignJob(job: Job<SendCampaignJobData>): Promise<void> {
  await executeCampaignLeadSend(job.data, job);
}

let isProcessingDue = false;

/**
 * Checks the database for any campaign leads that are scheduled for delivery now (or overdue).
 * Dispatches them immediately and updates their status.
 * This runs continuously and also on every client campaign query to guarantee delivery even
 * when Redis/BullMQ connections are sleeping in serverless/cPanel environments.
 */
export async function processDueCampaignLeads(): Promise<number> {
  if (isProcessingDue) return 0;
  isProcessingDue = true;

  try {
    await pool.query("update campaign_leads set status='unknown',error_message='Delivery interrupted; verify with your mail provider before retrying' where status='sending' and coalesce(claimed_at,'epoch'::timestamptz)<now()-interval '5 minutes'");
    // 1. Fetch all running campaigns
    const { rows: runningCampaigns } = await pool.query(
      `select id, name, delay_seconds from campaigns where status = 'running'`,
    );

    if (runningCampaigns.length === 0) return 0;

    let totalDispatched = 0;

    for (const camp of runningCampaigns) {
      const delaySeconds = Math.max(5, camp.delay_seconds || 60);

      // 2. Strict Pacing Check: When was the last email sent for this campaign?
      const lastSentRes = await pool.query(
        `select max(sent_at) as last_sent_at
         from campaign_leads
         where campaign_id = $1 and status = 'sent'`,
        [camp.id],
      );

      const lastSentAt = lastSentRes.rows[0]?.last_sent_at;
      if (lastSentAt) {
        const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
        const requiredCooldownMs = delaySeconds * 1000;
        if (elapsedMs < requiredCooldownMs) {
          // Cooldown active: wait for the interval to elapse
          continue;
        }
      }

      // 3. Prevent overlapping sends: check if an email is currently in transit
      const activeSendingRes = await pool.query(
        `select count(*) as count from campaign_leads where campaign_id = $1 and status = 'sending'`,
        [camp.id],
      );
      if (Number(activeSendingRes.rows[0]?.count ?? 0) > 0) {
        continue;
      }

      // 4. Find the NEXT due lead for this campaign (strictly 1 lead at a time)
      const leadRes = await pool.query(
        `select cl.id as campaign_lead_id, cl.campaign_id, cl.lead_id, cl.recipient_email, cl.scheduled_at
         from campaign_leads cl
         where cl.campaign_id = $1
           and cl.status in ('pending', 'queued')
         order by cl.scheduled_at asc nulls last, cl.id asc
         limit 1`,
        [camp.id],
      );

      if (leadRes.rows.length === 0) {
        // Check if campaign is completed
        const remainingRes = await pool.query(
          `select count(*) as count from campaign_leads
           where campaign_id = $1 and status in ('pending', 'queued', 'sending')`,
          [camp.id],
        );
        if (Number(remainingRes.rows[0]?.count ?? 0) === 0) {
          await pool.query(
            "update campaigns set status = 'completed', completed_at = now() where id = $1",
            [camp.id],
          );
          console.log(`[campaign-runner] Campaign ${camp.id} (${camp.name}) completed.`);
        }
        continue;
      }

      const nextLead = leadRes.rows[0];

      // If scheduled_at is in the future, don't send yet
      if (nextLead.scheduled_at && new Date(nextLead.scheduled_at).getTime() > Date.now()) {
        continue;
      }

      try {
        await executeCampaignLeadSend({
          campaignId: nextLead.campaign_id,
          campaignLeadId: nextLead.campaign_lead_id,
          leadId: nextLead.lead_id,
          recipientEmail: nextLead.recipient_email,
        });
        totalDispatched++;
      } catch (err) {
        console.error(`[campaign-runner] Error dispatching lead ${nextLead.campaign_lead_id}:`, err);
      }
    }

    return totalDispatched;
  } catch (err) {
    console.error("[campaign-runner] Error checking due leads:", err);
    return 0;
  } finally {
    isProcessingDue = false;
  }
}

let tickTimer: NodeJS.Timeout | null = null;

export function startCampaignTickRunner() {
  if (!tickTimer) {
    tickTimer = setInterval(() => {
      void processDueCampaignLeads();
    }, 5000);
    tickTimer.unref();
  }
}

export function startSendWorker() {
  startCampaignTickRunner();

  const worker = new Worker<SendCampaignJobData>(
    SEND_QUEUE_NAME,
    async (job) => {
      await processSendCampaignJob(job);
    },
    {
      connection: queueConnection,
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[send-worker] job ${job?.id} failed:`, err.message);
  });

  return worker;
}
