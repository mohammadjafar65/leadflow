import { describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/pool.js";
import { interpolateVariables, isEmailSuppressed } from "../src/lib/mailer.js";

const app = createApp();

function uniqueEmail() {
  return `camp-${randomUUID().slice(0, 8)}@example.test`;
}

async function createAuthedUser() {
  const email = uniqueEmail();
  const reg = await request(app).post("/api/v1/auth/register").send({
    email,
    password: "password123",
    orgName: "Campaign Test Org",
  });
  return {
    token: reg.body.accessToken as string,
    orgId: reg.body.user.orgId as string,
    userId: reg.body.user.id as string,
  };
}

async function createTestIdentity(orgId: string) {
  const res = await pool.query(
    `insert into sender_identities
       (organization_id, display_name, email_address, smtp_host, smtp_port, smtp_username, smtp_secret_encrypted, daily_send_cap)
     values ($1, 'Mohammad Jafar', 'mohammad@mzistudio.test', 'mail.privateemail.com', 465, 'mohammad@mzistudio.test', $2, 50)
     returning id`,
    [orgId, Buffer.from("PLAIN:mockpass123", "utf8")],
  );
  return res.rows[0].id as string;
}

describe("Campaigns & Automated Email Dispatch", () => {
  it("interpolates template variables correctly", () => {
    const template =
      "Hi {{first_name}}, I reviewed {{business_name}}'s site ({{website}}) in {{city}} and called {{phone}}.";
    const lead = {
      id: "1",
      name: "Apex Dental Clinic",
      website: "https://apexdental.com",
      phoneE164: "+15559876543",
      address: "100 Broadway, Austin, TX",
    };
    const interpolated = interpolateVariables(template, lead);
    expect(interpolated).toBe(
      "Hi Apex, I reviewed Apex Dental Clinic's site (apexdental.com) in Austin and called +15559876543.",
    );
  });

  it("checks suppression list correctly", async () => {
    const { orgId } = await createAuthedUser();
    const testEmail = `suppressed-${Date.now()}@example.com`;

    expect(await isEmailSuppressed(orgId, testEmail)).toBe(false);

    await pool.query(
      "insert into suppression_list (organization_id, email, reason) values ($1, $2, 'unsubscribed')",
      [orgId, testEmail],
    );

    expect(await isEmailSuppressed(orgId, testEmail)).toBe(true);
  });

  it("creates a campaign with custom delay, lists it, launches it, and pauses/resumes it", async () => {
    const { token, orgId } = await createAuthedUser();
    const identityId = await createTestIdentity(orgId);

    // Insert 2 test leads and their emails in enrichment_records
    const lead1 = await pool.query(
      `insert into leads (organization_id, name, website, stage)
       values ($1, 'Downtown Cafe', 'https://downtowncafe.test', 'new_lead')
       returning id`,
      [orgId],
    );
    await pool.query(
      `insert into enrichment_records (lead_id, field, value, source, confidence)
       values ($1, 'email', 'info@downtowncafe.test', 'site_scrape', 0.95)`,
      [lead1.rows[0].id],
    );

    const lead2 = await pool.query(
      `insert into leads (organization_id, name, website, stage)
       values ($1, 'Uptown Bistro', 'https://uptownbistro.test', 'new_lead')
       returning id`,
      [orgId],
    );
    await pool.query(
      `insert into enrichment_records (lead_id, field, value, source, confidence)
       values ($1, 'email', 'contact@uptownbistro.test', 'site_scrape', 0.95)`,
      [lead2.rows[0].id],
    );

    const leadIds = [lead1.rows[0].id, lead2.rows[0].id];

    // 1. Create Campaign with 60 seconds (1 min) delay
    const createRes = await request(app)
      .post("/api/v1/campaigns")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Spring Local Outreach",
        senderIdentityId: identityId,
        subject: "Quick question for {{business_name}}",
        bodyHtml: "<p>Hi {{first_name}}, check out MZI Studio.</p>",
        delaySeconds: 60, // 1 minute delay
        leadIds,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.campaign.name).toBe("Spring Local Outreach");
    expect(createRes.body.campaign.delaySeconds).toBe(60);
    expect(createRes.body.enrolledCount).toBe(2);

    const campaignId = createRes.body.campaign.id;

    // 2. List campaigns
    const listRes = await request(app)
      .get("/api/v1/campaigns")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.campaigns.length).toBeGreaterThanOrEqual(1);
    const found = listRes.body.campaigns.find((c: { id: string }) => c.id === campaignId);
    expect(found).toBeDefined();
    expect(found.senderDisplayName).toBe("Mohammad Jafar");

    // 3. Get single campaign with leads
    const getRes = await request(app)
      .get(`/api/v1/campaigns/${campaignId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.campaign.id).toBe(campaignId);
    expect(getRes.body.leads.length).toBe(2);
    const emails = getRes.body.leads.map((l: { recipientEmail: string }) => l.recipientEmail);
    expect(emails).toContain("info@downtowncafe.test");
    expect(emails).toContain("contact@uptownbistro.test");

    // 4. Launch campaign
    const launchRes = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/launch`)
      .set("Authorization", `Bearer ${token}`);
    expect(launchRes.status).toBe(200);
    expect(launchRes.body.success).toBe(true);
    expect(launchRes.body.queuedCount).toBe(2);

    // Verify campaign is running
    const runningRes = await request(app)
      .get(`/api/v1/campaigns/${campaignId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(runningRes.body.campaign.status).toBe("running");
    expect(runningRes.body.leads[0].status).toBe("queued");
    // Verify scheduled_at delay spacing (Lead 1 scheduled 60s after Lead 0)
    const t0 = new Date(runningRes.body.leads[0].scheduledAt).getTime();
    const t1 = new Date(runningRes.body.leads[1].scheduledAt).getTime();
    expect(Math.round((t1 - t0) / 1000)).toBeCloseTo(60, -1);

    // 5. Pause campaign
    const pauseRes = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/pause`)
      .set("Authorization", `Bearer ${token}`);
    expect(pauseRes.status).toBe(200);

    // 6. Resume campaign
    const resumeRes = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/resume`)
      .set("Authorization", `Bearer ${token}`);
    expect(resumeRes.status).toBe(200);
  });

  it("handles test email send successfully", async () => {
    const { token, orgId } = await createAuthedUser();
    const identityId = await createTestIdentity(orgId);

    const testSend = await request(app)
      .post("/api/v1/campaigns/test-send")
      .set("Authorization", `Bearer ${token}`)
      .send({
        senderIdentityId: identityId,
        recipientEmail: "tester@example.com",
        subject: "Test MZI Outreach",
        bodyHtml: "<p>Testing SMTP connection.</p>",
      });

    expect(testSend.status).toBe(200);
    expect(testSend.body.success).toBe(true);
    expect(testSend.body.simulated).toBe(true);
  });
});
