import { describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/pool.js";

const app = createApp();

function uniqueEmail() {
  return `batch-${randomUUID().slice(0, 8)}@example.test`;
}

async function createAuthedUser() {
  const email = uniqueEmail();
  const reg = await request(app).post("/api/v1/auth/register").send({
    email,
    password: "password123",
    orgName: "Batch Test Org",
  });
  return {
    token: reg.body.accessToken as string,
    orgId: reg.body.user.orgId as string,
    userId: reg.body.user.id as string,
  };
}

describe("Leads Batch Actions", () => {
  it("batch updates stage and batch deletes leads cleanly", async () => {
    const { token, orgId } = await createAuthedUser();

    // Insert 3 test leads
    const l1 = await pool.query(
      "insert into leads (organization_id, name, stage) values ($1, 'Lead 1', 'new_lead') returning id",
      [orgId],
    );
    const l2 = await pool.query(
      "insert into leads (organization_id, name, stage) values ($1, 'Lead 2', 'new_lead') returning id",
      [orgId],
    );
    const l3 = await pool.query(
      "insert into leads (organization_id, name, stage) values ($1, 'Lead 3', 'new_lead') returning id",
      [orgId],
    );

    const id1 = l1.rows[0].id;
    const id2 = l2.rows[0].id;
    const id3 = l3.rows[0].id;

    // 1. Batch stage change for id1 and id2 to "qualified"
    const stageRes = await request(app)
      .post("/api/v1/leads/batch-stage")
      .set("Authorization", `Bearer ${token}`)
      .send({ ids: [id1, id2], stage: "qualified" });

    expect(stageRes.status).toBe(200);
    expect(stageRes.body.updatedCount).toBe(2);

    // Verify stage in DB
    const check1 = await pool.query("select stage from leads where id = $1", [id1]);
    expect(check1.rows[0].stage).toBe("qualified");
    const check3 = await pool.query("select stage from leads where id = $1", [id3]);
    expect(check3.rows[0].stage).toBe("new_lead");

    // 2. Batch delete id1 and id3
    const delRes = await request(app)
      .post("/api/v1/leads/batch-delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ ids: [id1, id3] });

    expect(delRes.status).toBe(200);
    expect(delRes.body.deletedCount).toBe(2);

    // Verify in DB: id1 and id3 are deleted, id2 remains
    const remaining = await pool.query(
      "select id from leads where id in ($1, $2, $3)",
      [id1, id2, id3],
    );
    expect(remaining.rows.length).toBe(1);
    expect(remaining.rows[0].id).toBe(id2);
  });

  it("safely batch deletes leads that have email_events, sequence_enrollments, and merged_into relations", async () => {
    const { token, orgId } = await createAuthedUser();

    // 1. Create a sender identity & sequence
    const sender = await pool.query(
      `insert into sender_identities (
        organization_id, display_name, email_address, smtp_host, smtp_port, smtp_username, smtp_secret_encrypted
      ) values ($1, 'Test Sender', 'sender@test.org', 'smtp.test', 587, 'user', '\\x010203') returning id`,
      [orgId],
    );
    const seq = await pool.query(
      "insert into sequences (organization_id, name) values ($1, 'Test Sequence') returning id",
      [orgId],
    );

    // 2. Create lead A (active with outreach) and lead B (merged into A)
    const lA = await pool.query(
      "insert into leads (organization_id, name, stage) values ($1, 'Lead A', 'contacted') returning id",
      [orgId],
    );
    const idA = lA.rows[0].id;

    const lB = await pool.query(
      "insert into leads (organization_id, name, stage, merged_into) values ($1, 'Lead B', 'archived', $2) returning id",
      [orgId, idA],
    );
    const idB = lB.rows[0].id;

    // 3. Create sequence_enrollment for lead A
    const enr = await pool.query(
      "insert into sequence_enrollments (sequence_id, lead_id, sender_identity_id, current_step, status) values ($1, $2, $3, 1, 'active') returning id",
      [seq.rows[0].id, idA, sender.rows[0].id],
    );

    // 4. Create email_event for lead A
    await pool.query(
      "insert into email_events (enrollment_id, lead_id, sender_identity_id, step_index, type) values ($1, $2, $3, 0, 'sent')",
      [enr.rows[0].id, idA, sender.rows[0].id],
    );

    // 5. Batch delete both lead A and lead B
    const delRes = await request(app)
      .post("/api/v1/leads/batch-delete")
      .set("Authorization", `Bearer ${token}`)
      .send({ ids: [idA, idB] });

    expect(delRes.status).toBe(200);
    expect(delRes.body.deletedCount).toBe(2);

    // Verify both are completely removed without foreign key errors
    const check = await pool.query("select id from leads where id in ($1, $2)", [idA, idB]);
    expect(check.rows.length).toBe(0);
  });
});
