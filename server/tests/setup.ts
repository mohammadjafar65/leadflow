import { afterEach } from "vitest";
import { pool } from "../src/db/pool.js";

const TABLES = [
  "refresh_tokens",
  "users",
  "organizations",
  "leads",
  "enrichment_records",
  "tags",
  "lead_tags",
  "lead_activities",
  "sender_identities",
  "templates",
  "sequences",
  "sequence_steps",
  "sequence_enrollments",
  "email_events",
  "suppression_list",
  "jobs",
  "idempotency_keys",
  "audit_log",
];

afterEach(async () => {
  await pool.query("truncate table " + TABLES.join(", ") + " cascade");
});