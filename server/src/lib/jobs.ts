import { pool } from "../db/pool.js";
import { publishJobEvent } from "../db/redis.js";
import type { JobKind } from "../types/jobs.js";

export interface CreateJobInput {
  orgId: string;
  userId: string;
  kind: JobKind;
  params: unknown;
  idempotencyKey: string | null;
}

export async function createJobRow(input: CreateJobInput) {
  const initialProgress = { processed: 0, created: 0, merged: 0, total: 20 };
  const { rows } = await pool.query(
    `insert into jobs (organization_id, created_by, kind, status, params, idempotency_key, progress)
     values ($1, $2, $3, 'queued', $4::jsonb, $5, $6::jsonb)
     returning id, organization_id, kind, status, progress`,
    [
      input.orgId,
      input.userId,
      input.kind,
      JSON.stringify(input.params),
      input.idempotencyKey,
      JSON.stringify(initialProgress),
    ],
  );
  return rows[0] as { id: string; organization_id: string; kind: string; status: string; progress: unknown };
}

export async function setJobStatus(jobId: string, status: string, extra: { error?: string } = {}) {
  const updated = await pool.query(
    `update jobs set status = $2, error = coalesce($3, error), updated_at = now() where id = $1 and status <> 'cancelled'`,
    [jobId, status, extra.error ?? null],
  );
  if (updated.rowCount) await publishJobEvent(jobId, { type: "status", status, error: extra.error ?? null });
}

export async function updateJobProgress(jobId: string, progress: Record<string, unknown>) {
  await pool.query(
    `update jobs set progress = coalesce(progress, '{}'::jsonb) || $2::jsonb, updated_at = now() where id = $1`,
    [jobId, JSON.stringify(progress)],
  );
  await publishJobEvent(jobId, { type: "progress", progress });
}


export async function completeJob(jobId: string, result: Record<string, unknown>) {
  const updated = await pool.query(
    `update jobs set status = 'completed', result = $2::jsonb, progress = coalesce(progress, '{}'::jsonb) || $2::jsonb, updated_at = now() where id = $1 and status <> 'cancelled'`,
    [jobId, JSON.stringify(result)],
  );
  if (updated.rowCount) await publishJobEvent(jobId, { type: "status", status: "completed", result, progress: result });
}

export async function getJobRow(jobId: string, orgId: string) {
  const { rows } = await pool.query(
    "select * from jobs where id = $1 and organization_id = $2",
    [jobId, orgId],
  );
  return rows[0] as
    | {
        id: string;
        organization_id: string;
        kind: string;
        status: string;
        params: unknown;
        progress: Record<string, unknown>;
        result: unknown;
        error: string | null;
      }
    | undefined;
}
