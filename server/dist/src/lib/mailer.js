import { decryptSmtpSecret } from './smtp-secret.js';
import nodemailer from "nodemailer";
import { pool } from "../db/pool.js";
/**
 * Decrypts the AES-256-GCM encrypted SMTP password, or reads the dev PLAIN: prefix.
 */
export async function decryptSecret(buffer) {
    return decryptSmtpSecret(buffer);
}
/**
 * Replaces Handlebars-style merge tags with lead attributes.
 */
export function interpolateVariables(template, lead) {
    const companyName = lead.name || "Business";
    const firstName = companyName.split(" ")[0] || "there";
    const website = lead.website ? lead.website.replace(/^https?:\/\//i, "") : "";
    const phone = lead.phoneE164 || lead.phone_e164 || "";
    const address = lead.address || "";
    const category = lead.category || "business";
    return template
        .replace(/\{\{\s*business_name\s*\}\}/gi, companyName)
        .replace(/\{\{\s*company_name\s*\}\}/gi, companyName)
        .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
        .replace(/\{\{\s*website\s*\}\}/gi, website)
        .replace(/\{\{\s*phone\s*\}\}/gi, phone)
        .replace(/\{\{\s*address\s*\}\}/gi, address)
        .replace(/\{\{\s*city\s*\}\}/gi, address.split(",")[1]?.trim() || address)
        .replace(/\{\{\s*category\s*\}\}/gi, category);
}
/**
 * Checks if an email is suppressed for the given organization.
 */
export async function isEmailSuppressed(orgId, email) {
    const { rows } = await pool.query("select 1 from suppression_list where organization_id = $1 and lower(email) = lower($2) limit 1", [orgId, email]);
    return rows.length > 0;
}
/**
 * Checks if the sender identity has reached its daily sending cap.
 */
export async function isDailyCapExceeded(identityId, dailyCap) {
    const { rows } = await pool.query(`select count(*) as count from email_events
     where sender_identity_id = $1
       and type = 'sent'
       and created_at >= date_trunc('day', now())`, [identityId]);
    const count = Number(rows[0]?.count ?? 0);
    return count >= dailyCap;
}
/**
 * Dispatches an email using nodemailer, or performs a safe simulation if configured / test host.
 */
export async function dispatchEmail(params) {
    const { identity, recipientEmail, subject, bodyHtml, lead } = params;
    // 1. Check suppression list
    const suppressed = await isEmailSuppressed(identity.organization_id, recipientEmail);
    if (suppressed) {
        return {
            status: "skipped",
            error: "Recipient email is on organization suppression list",
        };
    }
    // 2. Check daily sending cap
    const capExceeded = await isDailyCapExceeded(identity.id, identity.daily_send_cap);
    if (capExceeded) {
        return {
            status: "failed",
            error: `Sender identity daily cap of ${identity.daily_send_cap} emails reached for today`,
        };
    }
    // 3. Interpolate variables
    const personalizedSubject = interpolateVariables(subject, lead);
    const personalizedHtml = interpolateVariables(bodyHtml, lead);
    // Plaintext version
    const textBody = personalizedHtml
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .trim();
    // 4. Determine if this is a simulation / dry-run
    //    - Always simulate in automated test suite (NODE_ENV === "test" or VITEST === "true")
    //    - If forceReal is set (e.g. test email), dispatch via real SMTP
    //    - Otherwise simulate if SIMULATE_EMAIL=true or ENABLE_REAL_SMTP=false
    const isSimulation = process.env.VITEST === "true" || process.env.NODE_ENV === "test"
        ? true
        : params.forceReal
            ? false
            : process.env.SIMULATE_EMAIL === "true" || process.env.ENABLE_REAL_SMTP === "false";
    if (isSimulation) {
        console.log(`[mailer] SIMULATED send to ${recipientEmail} (subject: "${interpolateVariables(subject, lead).slice(0, 60)}…")`);
        const fakeMessageId = `<sim-${Date.now()}-${Math.random().toString(36).slice(2)}@leadflow.local>`;
        return {
            status: "sent",
            messageId: fakeMessageId,
            simulated: true,
        };
    }
    // 5. Create real nodemailer transport
    let sendStarted = false;
    try {
        const password = await decryptSecret(identity.smtp_secret_encrypted);
        const transporter = nodemailer.createTransport({
            host: identity.smtp_host,
            port: identity.smtp_port,
            secure: identity.smtp_port === 465,
            auth: {
                user: identity.smtp_username,
                pass: password,
            },
            tls: {
                rejectUnauthorized: true,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
        });
        sendStarted = true;
        const info = await transporter.sendMail({
            from: `"${identity.display_name}" <${identity.email_address}>`,
            to: recipientEmail,
            ...(process.env.BCC_SENDER === "true" ? { bcc: identity.email_address } : {}),
            subject: personalizedSubject,
            text: textBody,
            html: personalizedHtml,
            headers: {
                "X-Mailer": "LeadFlow Outreach Engine v1.0",
            },
        });
        return {
            status: "sent",
            messageId: info.messageId,
            simulated: false,
        };
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
            status: sendStarted ? "unknown" : "failed",
            error: errorMessage,
        };
    }
}
//# sourceMappingURL=mailer.js.map