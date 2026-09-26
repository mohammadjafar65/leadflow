import { Router } from "express";
import { asyncHandler, ApiError } from "../lib/http.js";
import { currentAuth, requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
export const jobsRouter = Router();
jobsRouter.use(requireAuth);
/**
 * GET /jobs/:id — Returns current status, progress, result, and error for a job.
 * Used as a polling fallback when WebSocket is unavailable (architecture.md §3).
 */
jobsRouter.get("/jobs/:id", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(`select id, kind, status, progress, result, error, created_at, updated_at
       from jobs where id = $1 and organization_id = $2`, [req.params.id, auth.org]);
    const job = rows[0];
    if (!job)
        throw new ApiError(404, "Job not found");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({ job });
}));
/**
 * GET /jobs — List recent jobs for the org (latest 20).
 */
jobsRouter.get("/jobs", asyncHandler(async (_req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(`select id, kind, status, progress, result, error, created_at, updated_at
       from jobs where organization_id = $1
       order by created_at desc limit 20`, [auth.org]);
    res.json({ jobs: rows });
}));
jobsRouter.post("/jobs/:id/cancel", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const result = await pool.query("update jobs set status='cancelled',updated_at=now() where id=$1 and organization_id=$2 and status in ('queued','running') returning id", [req.params.id, auth.org]);
    if (!result.rowCount)
        throw new ApiError(409, "Job is missing or already finished");
    res.json({ cancelled: true });
}));
//# sourceMappingURL=jobs.js.map