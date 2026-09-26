import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ApiError, asyncHandler } from "../lib/http.js";
import { currentAuth, requireAuth } from "../middleware/auth.js";
import { sendQueue } from "../queue.js";
import { dispatchEmail } from "../lib/mailer.js";
export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);
// ─── Validation Schemas ──────────────────────────────────────────────────────
const createCampaignSchema = z.object({
    name: z.string().min(1).max(200),
    senderIdentityId: z.string().uuid(),
    templateId: z.string().uuid().optional(),
    subject: z.string().min(1).max(500),
    bodyHtml: z.string().min(1).max(100_000),
    delaySeconds: z.number().int().min(5).max(86400).default(60), // 1 min default
    leadIds: z.array(z.string().uuid()).min(1).max(1000),
    autoLaunch: z.boolean().default(false),
});
const testSendSchema = z.object({
    senderIdentityId: z.string().uuid(),
    recipientEmail: z.string().email(),
    subject: z.string().min(1).max(500),
    bodyHtml: z.string().min(1).max(100_000),
});
// ─── List Campaigns ──────────────────────────────────────────────────────────
campaignsRouter.get("/campaigns", asyncHandler(async (_req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(`select c.id, c.name, c.status, c.sender_identity_id, c.template_id,
              c.subject, c.body_html, c.delay_seconds, c.total_leads,
              c.sent_count, c.failed_count, c.created_at, c.started_at, c.completed_at,
              si.display_name as sender_display_name, si.email_address as sender_email_address,
              t.name as template_name
       from campaigns c
       left join sender_identities si on si.id = c.sender_identity_id
       left join templates t on t.id = c.template_id
       where c.organization_id = $1
       order by c.created_at desc`, [auth.org]);
    res.json({
        campaigns: rows.map((r) => ({
            id: r.id,
            name: r.name,
            status: r.status,
            senderIdentityId: r.sender_identity_id,
            senderDisplayName: r.sender_display_name,
            senderEmail: r.sender_email_address,
            templateId: r.template_id,
            templateName: r.template_name,
            subject: r.subject,
            bodyHtml: r.body_html,
            delaySeconds: r.delay_seconds,
            totalLeads: r.total_leads,
            sentCount: r.sent_count,
            failedCount: r.failed_count,
            createdAt: r.created_at,
            startedAt: r.started_at,
            completedAt: r.completed_at,
        })),
    });
}));
// ─── Create Campaign ─────────────────────────────────────────────────────────
campaignsRouter.post("/campaigns", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = createCampaignSchema.parse(req.body);
    // Verify sender identity belongs to org
    const identRes = await pool.query("select id from sender_identities where id = $1 and organization_id = $2", [body.senderIdentityId, auth.org]);
    if (!identRes.rows[0])
        throw new ApiError(400, "Sender identity not found");
    // Fetch leads and their primary emails from enrichment_records
    const leadsRes = await pool.query(`select l.id,
              (select value from enrichment_records where lead_id = l.id and field = 'email' order by confidence desc limit 1) as email
       from leads l
       where l.id = any($1::uuid[]) and l.organization_id = $2 and l.merged_into is null`, [body.leadIds, auth.org]);
    const validLeads = [];
    for (const lead of leadsRes.rows) {
        const email = lead.email;
        if (email && email.includes("@")) {
            validLeads.push({ leadId: lead.id, email: email.trim() });
        }
    }
    if (validLeads.length === 0) {
        throw new ApiError(400, "None of the selected leads have a valid email address.");
    }
    // Insert campaign
    const campRes = await pool.query(`insert into campaigns
         (organization_id, name, status, sender_identity_id, template_id, subject, body_html, delay_seconds, total_leads)
       values ($1, $2, 'draft', $3, $4, $5, $6, $7, $8)
       returning id, name, status, delay_seconds, total_leads, created_at`, [
        auth.org,
        body.name,
        body.senderIdentityId,
        body.templateId ?? null,
        body.subject,
        body.bodyHtml,
        body.delaySeconds,
        validLeads.length,
    ]);
    const campaign = campRes.rows[0];
    // Insert campaign_leads
    for (const item of validLeads) {
        await pool.query(`insert into campaign_leads (campaign_id, lead_id, recipient_email, status)
         values ($1, $2, $3, 'pending')
         on conflict (campaign_id, lead_id) do nothing`, [campaign.id, item.leadId, item.email]);
    }
    // If autoLaunch requested, launch immediately
    if (body.autoLaunch) {
        try {
            await launchCampaign(campaign.id, body.delaySeconds);
            campaign.status = "running";
        }
        catch (launchErr) {
            console.error(`[campaigns] Failed to auto-launch campaign ${campaign.id}:`, launchErr);
        }
    }
    res.status(201).json({
        campaign: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            delaySeconds: campaign.delay_seconds,
            totalLeads: campaign.total_leads,
            createdAt: campaign.created_at,
        },
        enrolledCount: validLeads.length,
        skippedCount: body.leadIds.length - validLeads.length,
    });
}));
// ─── Get Single Campaign ─────────────────────────────────────────────────────
campaignsRouter.get("/campaigns/:id", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const campRes = await pool.query(`select c.*,
              si.display_name as sender_display_name, si.email_address as sender_email_address,
              t.name as template_name
       from campaigns c
       left join sender_identities si on si.id = c.sender_identity_id
       left join templates t on t.id = c.template_id
       where c.id = $1 and c.organization_id = $2`, [req.params.id, auth.org]);
    if (!campRes.rows[0])
        throw new ApiError(404, "Campaign not found");
    const r = campRes.rows[0];
    // Fetch enrolled leads
    const leadsRes = await pool.query(`select cl.id as campaign_lead_id, cl.lead_id, cl.recipient_email, cl.status,
              cl.scheduled_at, cl.sent_at, cl.error_message, cl.retry_count,
              l.name as company_name, l.website, l.stage
       from campaign_leads cl
       join leads l on l.id = cl.lead_id
       where cl.campaign_id = $1
       order by cl.scheduled_at asc nulls last, cl.id asc`, [req.params.id]);
    res.json({
        campaign: {
            id: r.id,
            name: r.name,
            status: r.status,
            senderIdentityId: r.sender_identity_id,
            senderDisplayName: r.sender_display_name,
            senderEmail: r.sender_email_address,
            templateId: r.template_id,
            templateName: r.template_name,
            subject: r.subject,
            bodyHtml: r.body_html,
            delaySeconds: r.delay_seconds,
            totalLeads: r.total_leads,
            sentCount: r.sent_count,
            failedCount: r.failed_count,
            createdAt: r.created_at,
            startedAt: r.started_at,
            completedAt: r.completed_at,
        },
        leads: leadsRes.rows.map((l) => ({
            id: l.campaign_lead_id,
            leadId: l.lead_id,
            companyName: l.company_name,
            recipientEmail: l.recipient_email,
            website: l.website,
            stage: l.stage,
            status: l.status,
            scheduledAt: l.scheduled_at,
            sentAt: l.sent_at,
            errorMessage: l.error_message,
            retryCount: l.retry_count,
        })),
    });
}));
// ─── Launch Campaign ─────────────────────────────────────────────────────────
async function launchCampaign(campaignId, delaySeconds) {
    const { rows } = await pool.query(`select cl.id, cl.lead_id, cl.recipient_email
     from campaign_leads cl
     where cl.campaign_id = $1 and cl.status in ('pending', 'queued')
     order by cl.id asc`, [campaignId]);
    await pool.query("update campaigns set status = 'running', started_at = coalesce(started_at, now()) where id = $1", [campaignId]);
    if (rows.length === 0)
        return 0;
    // Check when the last email was sent for this campaign (if resuming or after partial sends)
    const lastSentRes = await pool.query(`select max(sent_at) as last_sent_at
     from campaign_leads
     where campaign_id = $1 and status = 'sent'`, [campaignId]);
    const lastSentAt = lastSentRes.rows[0]?.last_sent_at
        ? new Date(lastSentRes.rows[0].last_sent_at).getTime()
        : null;
    const now = Date.now();
    const stepMs = Math.max(5, delaySeconds) * 1000;
    // If an email was already sent recently, start the next lead after remaining cooldown
    let baseStartTime = now;
    if (lastSentAt) {
        const elapsed = now - lastSentAt;
        if (elapsed < stepMs) {
            baseStartTime = lastSentAt + stepMs;
        }
    }
    for (let i = 0; i < rows.length; i++) {
        const cl = rows[i];
        const scheduledAt = new Date(baseStartTime + (i * stepMs));
        const delayMs = Math.max(0, scheduledAt.getTime() - now);
        // Update scheduled timestamp and status in DB
        await pool.query("update campaign_leads set status = 'queued', scheduled_at = $1 where id = $2", [scheduledAt, cl.id]);
        // Add to BullMQ with custom calculated delay
        try {
            await sendQueue.add("send-campaign-email", {
                campaignId,
                campaignLeadId: cl.id,
                leadId: cl.lead_id,
                recipientEmail: cl.recipient_email,
            }, {
                delay: delayMs,
                jobId: `camp-${campaignId}-${cl.id}-${Date.now()}-${i}`,
                removeOnComplete: true,
                removeOnFail: true,
            });
        }
        catch (qErr) {
            console.error(`[campaigns] Failed to queue job for lead ${cl.lead_id}:`, qErr);
        }
    }
    return rows.length;
}
campaignsRouter.post("/campaigns/:id/launch", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const campRes = await pool.query("select id, status, delay_seconds from campaigns where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (!campRes.rows[0])
        throw new ApiError(404, "Campaign not found");
    const campaign = campRes.rows[0];
    if (campaign.status === "running") {
        throw new ApiError(400, "Campaign is already running");
    }
    if (campaign.status === "completed") {
        throw new ApiError(400, "Campaign has already completed");
    }
    try {
        const queuedCount = await launchCampaign(campaign.id, campaign.delay_seconds || 60);
        res.json({ success: true, queuedCount });
    }
    catch (err) {
        console.error(`[campaigns] Launch error for campaign ${campaign.id}:`, err);
        const msg = err instanceof Error ? err.message : String(err);
        throw new ApiError(500, `Failed to launch campaign: ${msg}`);
    }
}));
// ─── Pause Campaign ──────────────────────────────────────────────────────────
campaignsRouter.post("/campaigns/:id/pause", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const result = await pool.query("update campaigns set status = 'paused' where id = $1 and organization_id = $2 and status = 'running'", [req.params.id, auth.org]);
    if (result.rowCount === 0)
        throw new ApiError(400, "Campaign is not running");
    res.json({ success: true, status: "paused" });
}));
// ─── Resume Campaign ─────────────────────────────────────────────────────────
campaignsRouter.post("/campaigns/:id/resume", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const result = await pool.query("update campaigns set status = 'running' where id = $1 and organization_id = $2 and status = 'paused'", [req.params.id, auth.org]);
    if (result.rowCount === 0)
        throw new ApiError(400, "Campaign is not paused");
    res.json({ success: true, status: "running" });
}));
// ─── Delete / Cancel Campaign ────────────────────────────────────────────────
campaignsRouter.delete("/campaigns/:id", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const campRes = await pool.query("select id, status from campaigns where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (!campRes.rows[0])
        throw new ApiError(404, "Campaign not found");
    // Cancel in-flight jobs and delete record
    await pool.query("delete from campaigns where id = $1 and organization_id = $2", [
        req.params.id,
        auth.org,
    ]);
    res.status(204).end();
}));
// ─── Retry Failed Leads ───────────────────────────────────────────────────────
campaignsRouter.post("/campaigns/:id/retry", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const campRes = await pool.query("select id, status, delay_seconds from campaigns where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (!campRes.rows[0])
        throw new ApiError(404, "Campaign not found");
    const campaign = campRes.rows[0];
    // Reset failed leads back to pending
    await pool.query(`update campaign_leads
       set status = 'pending', error_message = null, retry_count = 0, scheduled_at = null, sent_at = null
       where campaign_id = $1 and status = 'failed'`, [campaign.id]);
    // Reset campaign failed counter and ensure status is running
    await pool.query(`update campaigns
       set failed_count = 0, status = 'running', started_at = coalesce(started_at, now())
       where id = $1`, [campaign.id]);
    // Re-queue them
    const queuedCount = await launchCampaign(campaign.id, campaign.delay_seconds);
    res.json({ success: true, retriedCount: queuedCount });
}));
// ─── Send Test Email ─────────────────────────────────────────────────────────
campaignsRouter.post("/campaigns/test-send", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = testSendSchema.parse(req.body);
    const identRes = await pool.query(`select id, organization_id, display_name, email_address, smtp_host, smtp_port,
              smtp_username, smtp_secret_encrypted, daily_send_cap
       from sender_identities where id = $1 and organization_id = $2`, [body.senderIdentityId, auth.org]);
    const identity = identRes.rows[0];
    if (!identity)
        throw new ApiError(404, "Sender identity not found");
    const result = await dispatchEmail({
        identity,
        recipientEmail: body.recipientEmail,
        subject: body.subject,
        bodyHtml: body.bodyHtml,
        lead: {
            id: "test-preview",
            name: "Acme Dental Care",
            website: "https://acmedental.example.com",
            phoneE164: "+15551234567",
            address: "123 Main St, Austin, TX",
            category: "Dental Clinic",
            email: body.recipientEmail,
        },
        forceReal: true,
    });
    if (result.status === "failed") {
        throw new ApiError(400, result.error || "Failed to send test email");
    }
    res.json({
        success: true,
        messageId: result.messageId,
        simulated: result.simulated ?? false,
    });
}));
//# sourceMappingURL=campaigns.js.map