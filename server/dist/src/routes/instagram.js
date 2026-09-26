import { processActiveInstagramAutomations } from "../worker/ig-poller.js";
import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import { ApiError, asyncHandler } from "../lib/http.js";
import { currentAuth, requireAuth } from "../middleware/auth.js";
import { encrypt, decrypt } from "../lib/encrypt.js";
import { buildOAuthUrl, exchangeCodeForToken, resolveIgAccount, subscribePageToWebhook, getAccountMedia, getMediaComments, resolveMediaByUrl, GraphApiError, } from "../lib/meta-graph.js";
import { env } from "../config/env.js";
export const instagramRouter = Router();
instagramRouter.use(requireAuth);
// ─── Validation Schemas ────────────────────────────────────────────────────
const TRIGGER_TYPES = ["comment_to_dm", "story_reply", "keyword_dm"];
const createAutomationSchema = z.object({
    instagramAccountId: z.string().uuid(),
    name: z.string().min(1).max(200),
    triggerType: z.enum(TRIGGER_TYPES),
    keywords: z.array(z.string().min(1).max(50)).max(20).default([]),
    messageTemplate: z.string().min(1).max(1000),
    linkUrl: z.string().url().optional().or(z.literal("")),
    buttonLabel: z.string().max(80).optional().or(z.literal("")),
    commentReplyTemplate: z.string().max(500).optional().or(z.literal("")),
    targetMediaId: z.string().max(100).optional().nullable(),
    targetMediaUrl: z.string().url().optional().nullable().or(z.literal("")),
    targetMediaCaption: z.string().max(3000).optional().nullable(),
});
const updateAutomationSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    triggerType: z.enum(TRIGGER_TYPES).optional(),
    keywords: z.array(z.string().min(1).max(50)).max(20).optional(),
    messageTemplate: z.string().min(1).max(1000).optional(),
    linkUrl: z.string().url().optional().or(z.literal("")).optional(),
    buttonLabel: z.string().max(80).optional().or(z.literal("")).optional(),
    commentReplyTemplate: z.string().max(500).optional().or(z.literal("")),
    targetMediaId: z.string().max(100).optional().nullable(),
    targetMediaUrl: z.string().url().optional().nullable().or(z.literal("")),
    targetMediaCaption: z.string().max(3000).optional().nullable(),
    isActive: z.boolean().optional(),
});
// ─── OAuth ─────────────────────────────────────────────────────────────────
function getOAuthOrigin(req) {
    const origins = env.CLIENT_ORIGIN.split(",").map((s) => s.trim());
    try {
        const reqOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
        if (reqOrigin && origins.includes(reqOrigin)) {
            return reqOrigin;
        }
    }
    catch {
        // fallback
    }
    return origins.find((o) => o.startsWith("https://")) || origins[0];
}
/** GET /instagram/oauth-url — Returns the Meta OAuth URL for the frontend to redirect to */
instagramRouter.get("/instagram/oauth-url", asyncHandler(async (req, res) => {
    if (!env.META_APP_ID) {
        throw new ApiError(503, "Instagram integration not configured. Set META_APP_ID.");
    }
    const origin = getOAuthOrigin(req);
    const state = crypto.randomBytes(32).toString("hex");
    const auth = currentAuth(res);
    await pool.query("delete from instagram_oauth_states where expires_at<now()");
    await pool.query("insert into instagram_oauth_states (state_hash,user_id,organization_id,origin,expires_at) values ($1,$2,$3,$4,now()+interval '10 minutes')", [crypto.createHash('sha256').update(state).digest('hex'), auth.sub, auth.org, origin]);
    const url = buildOAuthUrl(state, origin);
    res.json({ url, state });
}));
/** POST /instagram/oauth-callback — Exchanges the auth code for a token and saves the account */
instagramRouter.post("/instagram/oauth-callback", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const { code, state } = z.object({ code: z.string().min(1), state: z.string().min(32).max(200) }).parse(req.body);
    const valid = await pool.query("delete from instagram_oauth_states where state_hash=$1 and user_id=$2 and organization_id=$3 and expires_at>now() returning origin", [crypto.createHash('sha256').update(state).digest('hex'), auth.sub, auth.org]);
    if (!valid.rows[0])
        throw new ApiError(400, "Instagram connection expired or invalid. Start again.");
    if (!env.META_APP_ID || !env.META_APP_SECRET) {
        throw new ApiError(503, "Instagram integration not configured.");
    }
    // Exchange code for long-lived token using the same redirect URI
    const origin = valid.rows[0].origin;
    let tokenResult;
    try {
        tokenResult = await exchangeCodeForToken(code, origin);
    }
    catch (e) {
        const msg = e instanceof GraphApiError ? e.message : "OAuth token exchange failed";
        throw new ApiError(400, msg);
    }
    // Resolve IG Business account from the token
    const igAccount = await resolveIgAccount(tokenResult.accessToken);
    if (!igAccount) {
        throw new ApiError(400, "No Instagram Business account found linked to your Facebook Page.");
    }
    // Subscribe page to webhooks
    try {
        await subscribePageToWebhook(igAccount.pageId, igAccount.pageAccessToken);
    }
    catch {
        // Non-fatal: webhooks may not be configured yet in dev
    }
    // Upsert: if same IG account reconnected, refresh the token
    const encryptedToken = encrypt(igAccount.pageAccessToken);
    const expiresAt = tokenResult.expiresIn
        ? new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString()
        : null;
    const { rows } = await pool.query(`insert into instagram_accounts
         (organization_id, ig_user_id, username, page_access_token, token_expires_at)
       values ($1, $2, $3, $4, $5)
       on conflict (organization_id, ig_user_id)
       do update set
         username = excluded.username,
         page_access_token = excluded.page_access_token,
         token_expires_at = excluded.token_expires_at,
         updated_at = now()
       returning id, ig_user_id, username, token_expires_at`, [auth.org, igAccount.igUserId, igAccount.username, encryptedToken, expiresAt]);
    const r = rows[0];
    res.status(201).json({
        account: {
            id: r.id,
            igUserId: r.ig_user_id,
            username: r.username,
            tokenExpiresAt: r.token_expires_at,
        },
    });
}));
/** POST /instagram/connect-token — Connects an account directly with an access token (e.g. from Meta Dashboard Step 2) */
instagramRouter.post("/instagram/connect-token", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const { accessToken } = z.object({ accessToken: z.string().min(10) }).parse(req.body);
    const igAccount = await resolveIgAccount(accessToken.trim());
    if (!igAccount) {
        throw new ApiError(400, "Could not find an Instagram Business account for this token. Make sure the token has permissions or is linked to your Instagram account.");
    }
    try {
        await subscribePageToWebhook(igAccount.pageId, igAccount.pageAccessToken);
    }
    catch {
        // Non-fatal in dev
    }
    const encryptedToken = encrypt(igAccount.pageAccessToken);
    const { rows } = await pool.query(`insert into instagram_accounts
         (organization_id, ig_user_id, username, page_access_token, token_expires_at)
       values ($1, $2, $3, $4, $5)
       on conflict (organization_id, ig_user_id)
       do update set
         username = excluded.username,
         page_access_token = excluded.page_access_token,
         token_expires_at = excluded.token_expires_at,
         updated_at = now()
       returning id, ig_user_id, username, token_expires_at`, [auth.org, igAccount.igUserId, igAccount.username, encryptedToken, null]);
    const r = rows[0];
    res.status(201).json({
        account: {
            id: r.id,
            igUserId: r.ig_user_id,
            username: r.username,
            tokenExpiresAt: r.token_expires_at,
        },
    });
}));
// ─── Accounts ──────────────────────────────────────────────────────────────
/** GET /instagram/accounts — Lists connected IG accounts */
instagramRouter.get("/instagram/accounts", asyncHandler(async (_req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(`select id, ig_user_id, username, token_expires_at, created_at
       from instagram_accounts
       where organization_id = $1
       order by created_at desc`, [auth.org]);
    res.json({
        accounts: rows.map((r) => ({
            id: r.id,
            igUserId: r.ig_user_id,
            username: r.username,
            tokenExpiresAt: r.token_expires_at,
            createdAt: r.created_at,
        })),
    });
}));
/** DELETE /instagram/accounts/:id — Disconnects an IG account */
instagramRouter.delete("/instagram/accounts/:id", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const result = await pool.query("delete from instagram_accounts where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (result.rowCount === 0)
        throw new ApiError(404, "Instagram account not found");
    res.status(204).end();
}));
// ─── Media ─────────────────────────────────────────────────────────────────
/** GET /instagram/media — Fetches recent Reels/posts published by the account */
instagramRouter.get("/instagram/media", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const accountId = req.query.accountId;
    if (!accountId)
        throw new ApiError(400, "accountId query parameter is required");
    const { rows } = await pool.query("select page_access_token, ig_user_id from instagram_accounts where id = $1 and organization_id = $2", [accountId, auth.org]);
    if (!rows[0])
        throw new ApiError(404, "Instagram account not found");
    const token = decrypt(rows[0].page_access_token);
    const media = await getAccountMedia(token, rows[0].ig_user_id, 30);
    res.json({ media });
}));
/** GET /instagram/resolve-reel — Resolves an Instagram Reel URL to its media ID and metadata */
instagramRouter.get("/instagram/resolve-reel", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const accountId = req.query.accountId;
    const url = req.query.url;
    if (!accountId || !url)
        throw new ApiError(400, "accountId and url query parameters required");
    const { rows } = await pool.query("select page_access_token, ig_user_id from instagram_accounts where id = $1 and organization_id = $2", [accountId, auth.org]);
    if (!rows[0])
        throw new ApiError(404, "Instagram account not found");
    const token = decrypt(rows[0].page_access_token);
    const media = await resolveMediaByUrl(token, rows[0].ig_user_id, url);
    res.json({ media });
}));
// ─── Helper Functions ──────────────────────────────────────────────────────
export function matchesKeywords(text, keywords) {
    if (!keywords || keywords.length === 0) {
        return { matches: true, matchedKeyword: null };
    }
    // If keywords contains wildcard "*" or "ALL" or empty string, match any comment
    for (const kw of keywords) {
        const trimmed = (kw || "").trim();
        if (trimmed === "*" || trimmed.toUpperCase() === "ALL" || trimmed === "") {
            return { matches: true, matchedKeyword: kw };
        }
    }
    const rawText = (text || "").trim();
    if (!rawText) {
        return { matches: false, matchedKeyword: null };
    }
    // Normalize: remove emojis and special punctuation for comparison, convert to uppercase
    const cleanText = rawText
        .normalize("NFKD")
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, " ")
        .replace(/["'“”‘’`]/g, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .trim()
        .toUpperCase();
    const words = cleanText.split(/\s+/).filter(Boolean);
    const rawUpper = rawText.toUpperCase();
    for (const kw of keywords) {
        const cleanKw = (kw || "")
            .normalize("NFKD")
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, " ")
            .replace(/["'“”‘’`]/g, " ")
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .trim()
            .toUpperCase();
        if (!cleanKw) {
            // If keyword was an emoji or symbol, fallback to raw comparison
            const rawKw = (kw || "").trim().toUpperCase();
            if (rawKw && (rawUpper === rawKw || rawUpper.includes(rawKw))) {
                return { matches: true, matchedKeyword: kw };
            }
            continue;
        }
        // Exact match, word match, or substring match
        if (cleanText === cleanKw ||
            words.includes(cleanKw) ||
            cleanText.includes(cleanKw) ||
            rawUpper.includes(cleanKw)) {
            return { matches: true, matchedKeyword: kw };
        }
    }
    return { matches: false, matchedKeyword: null };
}
// ─── Automations ───────────────────────────────────────────────────────────
/** GET /instagram/automations — Lists all automations for the org */
instagramRouter.get("/instagram/automations", asyncHandler(async (_req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(`select a.id, a.instagram_account_id, a.name, a.trigger_type, a.keywords,
              a.message_template, a.link_url, a.button_label, a.comment_reply_template,
              a.target_media_id, a.target_media_url, a.target_media_caption,
              a.is_active, a.created_at, a.updated_at,
              ia.username as account_username
       from ig_automations a
       join instagram_accounts ia on ia.id = a.instagram_account_id
       where a.organization_id = $1
       order by a.created_at desc`, [auth.org]);
    res.json({
        automations: rows.map(mapAutomation),
    });
}));
/** POST /instagram/automations — Creates a new automation */
instagramRouter.post("/instagram/automations", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = createAutomationSchema.parse(req.body);
    // Verify the IG account belongs to this org
    const acctCheck = await pool.query("select id, page_access_token, ig_user_id from instagram_accounts where id = $1 and organization_id = $2", [body.instagramAccountId, auth.org]);
    if (!acctCheck.rows[0])
        throw new ApiError(404, "Instagram account not found");
    let targetMediaId = body.targetMediaId || null;
    let targetMediaUrl = body.targetMediaUrl || null;
    let targetMediaCaption = body.targetMediaCaption || null;
    // Auto-resolve media ID if user provided a URL/link but not an ID
    if (!targetMediaId && targetMediaUrl) {
        try {
            const token = decrypt(acctCheck.rows[0].page_access_token);
            const resolved = await resolveMediaByUrl(token, acctCheck.rows[0].ig_user_id, targetMediaUrl);
            if (resolved) {
                targetMediaId = resolved.id;
                targetMediaUrl = resolved.permalink || targetMediaUrl;
                targetMediaCaption = resolved.caption || targetMediaCaption;
            }
        }
        catch (err) {
            console.warn("[automations] Failed to auto-resolve media from url:", err);
        }
    }
    const { rows } = await pool.query(`insert into ig_automations
         (organization_id, instagram_account_id, name, trigger_type, keywords,
          message_template, link_url, button_label, comment_reply_template,
          target_media_id, target_media_url, target_media_caption)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning id, instagram_account_id, name, trigger_type, keywords,
                 message_template, link_url, button_label, comment_reply_template,
                 target_media_id, target_media_url, target_media_caption,
                 is_active, created_at, updated_at`, [
        auth.org,
        body.instagramAccountId,
        body.name,
        body.triggerType,
        body.keywords,
        body.messageTemplate,
        body.linkUrl || null,
        body.buttonLabel || null,
        body.commentReplyTemplate || null,
        targetMediaId,
        targetMediaUrl,
        targetMediaCaption,
    ]);
    res.status(201).json({ automation: mapAutomation(rows[0]) });
}));
/** PATCH /instagram/automations/:id — Updates an automation (including toggle active) */
instagramRouter.patch("/instagram/automations/:id", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = updateAutomationSchema.parse(req.body);
    let targetMediaId = body.targetMediaId;
    let targetMediaUrl = body.targetMediaUrl;
    let targetMediaCaption = body.targetMediaCaption;
    // Auto-resolve media ID if user supplied a URL without ID
    if (!targetMediaId && targetMediaUrl) {
        try {
            const acctRes = await pool.query(`select ia.page_access_token, ia.ig_user_id
           from ig_automations a
           join instagram_accounts ia on ia.id = a.instagram_account_id
           where a.id = $1 and a.organization_id = $2`, [req.params.id, auth.org]);
            if (acctRes.rows[0]) {
                const token = decrypt(acctRes.rows[0].page_access_token);
                const resolved = await resolveMediaByUrl(token, acctRes.rows[0].ig_user_id, targetMediaUrl);
                if (resolved) {
                    targetMediaId = resolved.id;
                    targetMediaUrl = resolved.permalink || targetMediaUrl;
                    if (!targetMediaCaption)
                        targetMediaCaption = resolved.caption || null;
                }
            }
        }
        catch (err) {
            console.warn("[automations/patch] Failed to auto-resolve media from url:", err);
        }
    }
    // Build dynamic SET clause
    const updates = ["updated_at = now()"];
    const params = [req.params.id, auth.org];
    let idx = 3;
    if (body.name !== undefined) {
        updates.push(`name = $${idx++}`);
        params.push(body.name);
    }
    if (body.triggerType !== undefined) {
        updates.push(`trigger_type = $${idx++}`);
        params.push(body.triggerType);
    }
    if (body.keywords !== undefined) {
        updates.push(`keywords = $${idx++}`);
        params.push(body.keywords);
    }
    if (body.messageTemplate !== undefined) {
        updates.push(`message_template = $${idx++}`);
        params.push(body.messageTemplate);
    }
    if (body.linkUrl !== undefined) {
        updates.push(`link_url = $${idx++}`);
        params.push(body.linkUrl || null);
    }
    if (body.buttonLabel !== undefined) {
        updates.push(`button_label = $${idx++}`);
        params.push(body.buttonLabel || null);
    }
    if (body.commentReplyTemplate !== undefined) {
        updates.push(`comment_reply_template = $${idx++}`);
        params.push(body.commentReplyTemplate || null);
    }
    if (targetMediaId !== undefined) {
        updates.push(`target_media_id = $${idx++}`);
        params.push(targetMediaId || null);
    }
    if (targetMediaUrl !== undefined) {
        updates.push(`target_media_url = $${idx++}`);
        params.push(targetMediaUrl || null);
    }
    if (targetMediaCaption !== undefined) {
        updates.push(`target_media_caption = $${idx++}`);
        params.push(targetMediaCaption || null);
    }
    if (body.isActive !== undefined) {
        updates.push(`is_active = $${idx++}`);
        params.push(body.isActive);
    }
    const { rows } = await pool.query(`update ig_automations
       set ${updates.join(", ")}
       where id = $1 and organization_id = $2
       returning id, instagram_account_id, name, trigger_type, keywords,
                 message_template, link_url, button_label, comment_reply_template,
                 target_media_id, target_media_url, target_media_caption,
                 is_active, created_at, updated_at`, params);
    if (!rows[0])
        throw new ApiError(404, "Automation not found");
    res.json({ automation: mapAutomation(rows[0]) });
}));
/** DELETE /instagram/automations/:id */
instagramRouter.delete("/instagram/automations/:id", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const result = await pool.query("delete from ig_automations where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (result.rowCount === 0)
        throw new ApiError(404, "Automation not found");
    res.status(204).end();
}));
/** GET /instagram/automations/:id/events — Paginated DM event log */
instagramRouter.get("/instagram/automations/:id/events", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const limit = Math.min(Number(req.query.limit) || 1000, 100000);
    const offset = Number(req.query.offset) || 0;
    // Verify automation belongs to org
    const automationCheck = await pool.query("select id from ig_automations where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (!automationCheck.rows[0])
        throw new ApiError(404, "Automation not found");
    const { rows } = await pool.query(`select id, trigger_type, trigger_source_id, recipient_ig_id, recipient_username,
              status, error_message, queued_at, sent_at, created_at,
              comment_text, media_id, media_url, action_taken
       from ig_automation_events
       where automation_id = $1
       order by created_at desc
       limit $2 offset $3`, [req.params.id, limit, offset]);
    res.json({
        events: rows.map((r) => ({
            id: r.id,
            triggerType: r.trigger_type,
            triggerSourceId: r.trigger_source_id,
            recipientIgId: r.recipient_ig_id,
            recipientUsername: r.recipient_username,
            status: r.status,
            errorMessage: r.error_message,
            queuedAt: r.queued_at,
            sentAt: r.sent_at,
            createdAt: r.created_at,
            commentText: r.comment_text,
            mediaId: r.media_id,
            mediaUrl: r.media_url,
            actionTaken: r.action_taken,
        })),
    });
}));
/** GET /instagram/automations/:id/comments — Fetches live comments on target Reel and matches with automation */
instagramRouter.get("/instagram/automations/:id/comments", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(`select a.*, ia.page_access_token, ia.ig_user_id, ia.username as account_username
       from ig_automations a
       join instagram_accounts ia on ia.id = a.instagram_account_id
       where a.id = $1 and a.organization_id = $2`, [req.params.id, auth.org]);
    if (rows.length === 0)
        throw new ApiError(404, "Automation not found");
    const automation = rows[0];
    let token;
    try {
        token = decrypt(automation.page_access_token);
    }
    catch {
        throw new ApiError(500, "Could not decrypt account access token");
    }
    // 1. Fetch live comments from Meta Graph API (unlimited pagination)
    let rawComments = [];
    if (automation.target_media_id) {
        rawComments = await getMediaComments(token, automation.target_media_id, 10000);
    }
    else {
        // "All Reels / Posts" — check recent media and combine
        try {
            const recentMedia = await getAccountMedia(token, automation.ig_user_id, 20);
            for (const m of recentMedia) {
                const mComments = await getMediaComments(token, m.id, 1000);
                rawComments.push(...mComments);
            }
        }
        catch (err) {
            console.warn("[automations/comments] Failed to fetch media comments for all-reels:", err);
        }
    }
    // 2. Fetch all recorded events for this automation
    const { rows: events } = await pool.query(`select trigger_source_id, recipient_username, status, action_taken, sent_at, created_at
       from ig_automation_events
       where automation_id = $1`, [automation.id]);
    const eventMap = new Map();
    for (const ev of events) {
        if (ev.trigger_source_id) {
            eventMap.set(ev.trigger_source_id, ev);
        }
    }
    // 3. Process each comment to calculate match and reply status
    const keywords = automation.keywords || [];
    const processedComments = rawComments.map((comment) => {
        const isSelf = (comment.from?.id && comment.from.id === automation.ig_user_id) ||
            (comment.from?.username &&
                automation.account_username &&
                comment.from.username.toLowerCase() === automation.account_username.toLowerCase());
        const { matches: matchesKeyword, matchedKeyword } = matchesKeywords(comment.text || "", keywords);
        const existingEvent = eventMap.get(comment.id);
        const isSent = existingEvent?.status === "sent";
        let status = "pending";
        if (isSelf) {
            status = "self_comment";
        }
        else if (isSent) {
            status = "sent";
        }
        else if (existingEvent?.status) {
            status = existingEvent.status;
        }
        else if (!matchesKeyword) {
            status = "keyword_mismatch";
        }
        return {
            id: comment.id,
            text: comment.text,
            timestamp: comment.timestamp,
            from: comment.from,
            likeCount: comment.likeCount,
            isReply: comment.isReply ?? false,
            parentId: comment.parentId ?? null,
            isSelfComment: isSelf,
            matchesKeyword,
            matchedKeyword,
            status,
            actionTaken: existingEvent?.action_taken || null,
            sentAt: existingEvent?.sent_at || null,
        };
    });
    // Sort comments newest first
    processedComments.sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tB - tA;
    });
    res.json({
        targetMediaId: automation.target_media_id,
        targetMediaUrl: automation.target_media_url,
        comments: processedComments,
        totalCount: processedComments.length,
    });
}));
instagramRouter.post('/instagram/automations/:id/sync-comments', asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const exists = await pool.query('select id from ig_automations where id=$1 and organization_id=$2', [req.params.id, auth.org]);
    if (!exists.rowCount)
        throw new ApiError(404, 'Automation not found');
    const result = await processActiveInstagramAutomations(auth.org, req.params.id);
    res.json({ success: true, syncedCount: result.processedComments, repliedCount: 0, queuedCount: result.repliedCount, errors: [] });
}));
instagramRouter.post('/instagram/automations/:id/trigger-comment', asyncHandler(async (_req, _res) => {
    throw new ApiError(409, 'Use Sync comments to validate the comment against Instagram before queueing a reply.');
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAutomation(r) {
    return {
        id: r.id,
        instagramAccountId: r.instagram_account_id,
        accountUsername: r.account_username,
        name: r.name,
        triggerType: r.trigger_type,
        keywords: r.keywords ?? [],
        messageTemplate: r.message_template,
        linkUrl: r.link_url,
        buttonLabel: r.button_label ?? "Open Link",
        commentReplyTemplate: r.comment_reply_template ?? "I have sent Link, Please check your DM!",
        targetMediaId: r.target_media_id ?? null,
        targetMediaUrl: r.target_media_url ?? null,
        targetMediaCaption: r.target_media_caption ?? null,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
// Re-export for use in worker (decrypt access token when sending)
export { decrypt };
//# sourceMappingURL=instagram.js.map