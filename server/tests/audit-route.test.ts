import { describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/pool.js";

const app = createApp();

function uniqueEmail() {
  return `audit-${randomUUID().slice(0, 8)}@example.test`;
}

async function createAuthedUser() {
  const email = uniqueEmail();
  const reg = await request(app).post("/api/v1/auth/register").send({
    email,
    password: "password123",
    orgName: "MZI Studio Test Org",
  });
  return {
    token: reg.body.accessToken as string,
    orgId: reg.body.user.orgId as string,
    userId: reg.body.user.id as string,
  };
}

describe("Website Audit HTTP Routes", () => {
  it("runs an audit on a lead, saves it, and retrieves it via GET", async () => {
    const { token, orgId } = await createAuthedUser();

    // Insert a test lead with a website
    const leadRes = await pool.query(
      `insert into leads (organization_id, name, website, category, rating, review_count, stage, score)
       values ($1, 'Vanguard Dental Group', 'https://vanguarddental.example.com', 'Dental Clinic', 4.7, 85, 'new_lead', 75)
       returning id`,
      [orgId]
    );
    const leadId = leadRes.rows[0].id;

    // 1. Initial GET should return null audit
    const getBefore = await request(app)
      .get(`/api/v1/leads/${leadId}/audit`)
      .set("Authorization", `Bearer ${token}`);
    expect(getBefore.status).toBe(200);
    expect(getBefore.body.audit).toBeNull();

    // 2. Run POST audit
    const postAudit = await request(app)
      .post(`/api/v1/leads/${leadId}/audit`)
      .set("Authorization", `Bearer ${token}`);
    expect(postAudit.status).toBe(200);
    expect(postAudit.body.audit).toBeDefined();
    expect(postAudit.body.audit.overallScore).toBeGreaterThan(0);
    expect(postAudit.body.audit.findings.length).toBeGreaterThanOrEqual(3);
    expect(postAudit.body.audit.findings.length).toBeLessThanOrEqual(5);
    expect(postAudit.body.audit.generatedEmail.subject).toContain("Vanguard Dental Group");
    expect(postAudit.body.audit.generatedEmail.bodyText).toContain("Mohammad Jafar");
    expect(postAudit.body.audit.generatedEmail.bodyText).toContain("MZI Studio");

    // 3. GET after audit returns the saved audit report
    const getAfter = await request(app)
      .get(`/api/v1/leads/${leadId}/audit`)
      .set("Authorization", `Bearer ${token}`);
    expect(getAfter.status).toBe(200);
    expect(getAfter.body.audit).toBeDefined();
    expect(getAfter.body.audit.overallScore).toBe(postAudit.body.audit.overallScore);
    expect(getAfter.body.audit.findings.length).toBe(postAudit.body.audit.findings.length);
    expect(getAfter.body.audit.techStack).toBeDefined();
    expect(getAfter.body.audit.pillars.performance).toBeDefined();
  });

  it("returns 400 when attempting to audit a lead without a website", async () => {
    const { token, orgId } = await createAuthedUser();

    const leadRes = await pool.query(
      `insert into leads (organization_id, name, stage, score)
       values ($1, 'No Web Business', 'new_lead', 20)
       returning id`,
      [orgId]
    );
    const leadId = leadRes.rows[0].id;

    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/audit`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Lead does not have a website");
  });

  it("auto-seeds the default MZI Studio outreach template for an organization", async () => {
    const { token } = await createAuthedUser();

    const res = await request(app)
      .get("/api/v1/outreach/templates")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(1);
    expect(res.body.templates[0].name).toContain("MZI Studio");
    expect(res.body.templates[0].bodyHtml).toContain("Mohammad Jafar");
    expect(res.body.templates[0].bodyHtml).toContain("MZI Studio");
  });
});
