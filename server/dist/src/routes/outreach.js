import { encryptSmtpSecret as encryptSecret } from '../lib/smtp-secret.js';
import { Router } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import { pool } from "../db/pool.js";
import { ApiError, asyncHandler } from "../lib/http.js";
import { currentAuth, requireAuth, requireRole } from "../middleware/auth.js";
import { decryptSecret } from "../lib/mailer.js";
export const outreachRouter = Router();
outreachRouter.use(requireAuth);
// ─── Sender Identities ──────────────────────────────────────────────────────
const identitySchema = z.object({
    displayName: z.string().min(1).max(120),
    emailAddress: z.string().email(),
    smtpHost: z.string().min(1).max(253),
    smtpPort: z.number().int().min(1).max(65535),
    smtpUsername: z.string().min(1),
    smtpPassword: z.string().min(1), // stored encrypted
    imapHost: z.string().optional(),
    imapPort: z.number().int().min(1).max(65535).optional(),
    dailySendCap: z.number().int().min(1).max(5000).default(50),
});
/**
 * Encrypt SMTP password using AES-256-GCM.
 * Key comes from env.SMTP_ENCRYPTION_KEY (32 bytes hex).
 * Returns a hex string: iv(24) + authTag(32) + ciphertext.
 */
outreachRouter.get("/outreach/identities", asyncHandler(async (_req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(`select id, display_name, email_address, smtp_host, smtp_port, smtp_username,
              imap_host, imap_port, daily_send_cap, domain_age_days, created_at
       from sender_identities where organization_id = $1 order by created_at desc`, [auth.org]);
    res.json({
        identities: rows.map((r) => ({
            id: r.id,
            displayName: r.display_name,
            emailAddress: r.email_address,
            smtpHost: r.smtp_host,
            smtpPort: r.smtp_port,
            smtpUsername: r.smtp_username,
            imapHost: r.imap_host,
            imapPort: r.imap_port,
            dailySendCap: r.daily_send_cap,
            domainAgeDays: r.domain_age_days,
        })),
    });
}));
outreachRouter.post("/outreach/identities", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = identitySchema.parse(req.body);
    const encryptedSecret = await encryptSecret(body.smtpPassword);
    const { rows } = await pool.query(`insert into sender_identities
         (organization_id, display_name, email_address, smtp_host, smtp_port,
          smtp_username, smtp_secret_encrypted, imap_host, imap_port, daily_send_cap)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id, display_name, email_address, smtp_host, smtp_port, daily_send_cap`, [
        auth.org,
        body.displayName,
        body.emailAddress,
        body.smtpHost,
        body.smtpPort,
        body.smtpUsername,
        encryptedSecret,
        body.imapHost ?? null,
        body.imapPort ?? null,
        body.dailySendCap,
    ]);
    const r = rows[0];
    res.status(201).json({
        identity: {
            id: r.id,
            displayName: r.display_name,
            emailAddress: r.email_address,
            smtpHost: r.smtp_host,
            smtpPort: r.smtp_port,
            dailySendCap: r.daily_send_cap,
        },
    });
}));
outreachRouter.delete("/outreach/identities/:id", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const result = await pool.query("delete from sender_identities where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (result.rowCount === 0)
        throw new ApiError(404, "Identity not found");
    res.status(204).end();
}));
outreachRouter.post("/outreach/identities/:id/test", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(`select smtp_host, smtp_port, smtp_username, smtp_secret_encrypted
       from sender_identities where id = $1 and organization_id = $2`, [req.params.id, auth.org]);
    if (!rows[0])
        throw new ApiError(404, "Identity not found");
    const row = rows[0];
    try {
        const password = await decryptSecret(row.smtp_secret_encrypted);
        const transporter = nodemailer.createTransport({
            host: row.smtp_host,
            port: row.smtp_port,
            secure: row.smtp_port === 465,
            auth: {
                user: row.smtp_username,
                pass: password,
            },
            tls: {
                rejectUnauthorized: true,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000,
        });
        await transporter.verify();
        res.json({ success: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.json({ success: false, error: msg });
    }
}));
// ─── Templates ──────────────────────────────────────────────────────────────
const templateSchema = z.object({
    name: z.string().min(1).max(200),
    subject: z.string().min(1).max(500),
    bodyHtml: z.string().min(1).max(100_000),
    variantGroup: z.string().uuid().optional(),
});
outreachRouter.get("/outreach/templates", asyncHandler(async (_req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query("select id, name, subject, body_html, variant_group, created_at from templates where organization_id = $1 order by created_at desc", [auth.org]);
    res.json({
        templates: rows.map((r) => ({
            id: r.id,
            name: r.name,
            subject: r.subject,
            bodyHtml: r.body_html,
            variantGroup: r.variant_group,
        })),
    });
}));
outreachRouter.post("/outreach/templates", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = templateSchema.parse(req.body);
    const { rows } = await pool.query(`insert into templates (organization_id, name, subject, body_html, variant_group)
       values ($1,$2,$3,$4,$5)
       returning id, name, subject, body_html, variant_group`, [auth.org, body.name, body.subject, body.bodyHtml, body.variantGroup ?? null]);
    const r = rows[0];
    res.status(201).json({
        template: { id: r.id, name: r.name, subject: r.subject, bodyHtml: r.body_html, variantGroup: r.variant_group },
    });
}));
outreachRouter.patch("/outreach/templates/:id", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = templateSchema.partial().parse(req.body);
    const sets = [];
    const params = [req.params.id, auth.org];
    if (body.name !== undefined) {
        sets.push(`name = $${params.length + 1}`);
        params.push(body.name);
    }
    if (body.subject !== undefined) {
        sets.push(`subject = $${params.length + 1}`);
        params.push(body.subject);
    }
    if (body.bodyHtml !== undefined) {
        sets.push(`body_html = $${params.length + 1}`);
        params.push(body.bodyHtml);
    }
    if (sets.length === 0)
        throw new ApiError(400, "Nothing to update");
    const { rows } = await pool.query(`update templates set ${sets.join(", ")} where id = $1 and organization_id = $2 returning id, name, subject, body_html`, params);
    if (!rows[0])
        throw new ApiError(404, "Template not found");
    const r = rows[0];
    res.json({ template: { id: r.id, name: r.name, subject: r.subject, bodyHtml: r.body_html } });
}));
outreachRouter.delete("/outreach/templates/:id", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const result = await pool.query("delete from templates where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (result.rowCount === 0)
        throw new ApiError(404, "Template not found");
    res.status(204).end();
}));
//# sourceMappingURL=outreach.js.map