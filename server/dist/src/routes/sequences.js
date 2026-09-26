import { parseStepConfig } from "../lib/sequences/advance.js";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ApiError, asyncHandler } from "../lib/http.js";
import { currentAuth, requireAuth } from "../middleware/auth.js";
export const sequencesRouter = Router();
sequencesRouter.use(requireAuth);
const VALID_STEP_KINDS = ["delay", "condition", "send_email", "branch"];
// ─── Sequences ───────────────────────────────────────────────────────────────
const createSequenceSchema = z.object({
    name: z.string().min(1).max(200),
    industryVertical: z.string().max(120).optional(),
    isTemplate: z.boolean().default(false),
});
sequencesRouter.get("/sequences", asyncHandler(async (_req, res) => {
    const auth = currentAuth(res);
    // Fetch sequences with their steps in one query
    const { rows } = await pool.query(`select s.id, s.name, s.industry_vertical, s.is_template,
              coalesce(json_agg(
                jsonb_build_object('id', ss.id, 'order', ss.step_order, 'kind', ss.kind, 'config', ss.config)
                order by ss.step_order
              ) filter (where ss.id is not null), '[]'::json) as steps
       from sequences s
       left join sequence_steps ss on ss.sequence_id = s.id
       where s.organization_id = $1
       group by s.id
       order by s.name`, [auth.org]);
    res.json({
        sequences: rows.map((r) => ({
            id: r.id,
            name: r.name,
            industryVertical: r.industry_vertical,
            isTemplate: r.is_template,
            steps: r.steps.map((s) => ({
                id: s.id,
                order: s.order,
                kind: s.kind,
                config: s.config,
            })),
        })),
    });
}));
sequencesRouter.post("/sequences", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = createSequenceSchema.parse(req.body);
    const { rows } = await pool.query(`insert into sequences (organization_id, name, industry_vertical, is_template)
       values ($1, $2, $3, $4)
       returning id, name, industry_vertical, is_template`, [auth.org, body.name, body.industryVertical ?? null, body.isTemplate]);
    const r = rows[0];
    res.status(201).json({
        sequence: {
            id: r.id,
            name: r.name,
            industryVertical: r.industry_vertical,
            isTemplate: r.is_template,
            steps: [],
        },
    });
}));
sequencesRouter.delete("/sequences/:id", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const result = await pool.query("delete from sequences where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (result.rowCount === 0)
        throw new ApiError(404, "Sequence not found");
    res.status(204).end();
}));
// ─── Sequence Steps ──────────────────────────────────────────────────────────
const addStepSchema = z.object({
    order: z.number().int().min(1),
    kind: z.enum(VALID_STEP_KINDS),
    config: z.record(z.unknown()),
});
sequencesRouter.post("/sequences/:id/steps", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    // Verify the sequence belongs to this org
    const seqCheck = await pool.query("select id from sequences where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (!seqCheck.rows[0])
        throw new ApiError(404, "Sequence not found");
    const body = addStepSchema.parse(req.body);
    body.config = parseStepConfig(body.kind, body.config, body.order);
    const active = await pool.query("select id from sequence_enrollments where sequence_id=$1 and status in ('active','paused') limit 1", [req.params.id]);
    if (active.rowCount)
        throw new ApiError(409, "Pause and finish enrollments before editing the sequence");
    if (body.kind === 'send_email') {
        const t = await pool.query('select id from templates where id=$1 and organization_id=$2', [body.config.template_id, auth.org]);
        if (!t.rowCount)
            throw new ApiError(400, 'Template not found');
    }
    const duplicate = await pool.query('select id from sequence_steps where sequence_id=$1 and step_order=$2', [req.params.id, body.order]);
    if (duplicate.rowCount)
        throw new ApiError(409, 'Step order already exists');
    const { rows } = await pool.query(`insert into sequence_steps (sequence_id, step_order, kind, config)
       values ($1, $2, $3, $4::jsonb)
       returning id, step_order, kind, config`, [req.params.id, body.order, body.kind, JSON.stringify(body.config)]);
    const r = rows[0];
    res.status(201).json({
        step: {
            id: r.id,
            order: r.step_order,
            kind: r.kind,
            config: r.config,
        },
    });
}));
sequencesRouter.delete("/sequences/:id/steps/:stepId", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const seqCheck = await pool.query("select id from sequences where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (!seqCheck.rows[0])
        throw new ApiError(404, "Sequence not found");
    const active = await pool.query("select 1 from sequence_enrollments where sequence_id=$1 and status in ('active','paused') limit 1", [req.params.id]);
    if (active.rowCount)
        throw new ApiError(409, 'Cancel active enrollments before editing this sequence');
    const result = await pool.query("delete from sequence_steps where id = $1 and sequence_id = $2", [req.params.stepId, req.params.id]);
    if (result.rowCount === 0)
        throw new ApiError(404, "Step not found");
    res.status(204).end();
}));
// ─── Enrollments ─────────────────────────────────────────────────────────────
const enrollSchema = z.object({
    leadIds: z.array(z.string().uuid()).min(1).max(500),
    senderIdentityId: z.string().uuid(),
});
sequencesRouter.post("/sequences/:id/enroll", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const seqCheck = await pool.query("select id from sequences where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (!seqCheck.rows[0])
        throw new ApiError(404, "Sequence not found");
    const body = enrollSchema.parse(req.body);
    const identity = await pool.query('select id from sender_identities where id=$1 and organization_id=$2', [body.senderIdentityId, auth.org]);
    if (!identity.rowCount)
        throw new ApiError(400, 'Sender does not belong to this workspace');
    const leads = await pool.query('select id from leads where id=any($1::uuid[]) and organization_id=$2', [body.leadIds, auth.org]);
    if (leads.rowCount !== new Set(body.leadIds).size)
        throw new ApiError(400, 'One or more leads do not belong to this workspace');
    const steps = await pool.query('select * from sequence_steps where sequence_id=$1 order by step_order', [req.params.id]);
    if (!steps.rowCount)
        throw new ApiError(400, 'Add a step before enrolling leads');
    for (const step of steps.rows) {
        const config = parseStepConfig(step.kind, step.config, step.step_order);
        if (['condition', 'branch'].includes(step.kind) && (!steps.rows.some(s => s.step_order === config.on_true) || !steps.rows.some(s => s.step_order === config.on_false)))
            throw new ApiError(400, 'Branch destination does not exist');
    }
    // Insert enrollments, skipping any already enrolled (upsert semantics)
    let enrolled = 0;
    let skipped = 0;
    for (const leadId of body.leadIds) {
        const result = await pool.query(`insert into sequence_enrollments (sequence_id, lead_id, sender_identity_id)
         values ($1, $2, $3)
         on conflict (sequence_id, lead_id) do nothing`, [req.params.id, leadId, body.senderIdentityId]);
        if ((result.rowCount ?? 0) > 0)
            enrolled++;
        else
            skipped++;
    }
    res.json({ enrolled, skipped });
}));
sequencesRouter.get("/sequences/:id/stats", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const seqCheck = await pool.query("select id from sequences where id = $1 and organization_id = $2", [req.params.id, auth.org]);
    if (!seqCheck.rows[0])
        throw new ApiError(404, "Sequence not found");
    const { rows } = await pool.query(`select status, count(*) as count
       from sequence_enrollments where sequence_id = $1 group by status`, [req.params.id]);
    const stats = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
    res.json({ stats });
}));
sequencesRouter.patch('/sequences/:id/enrollments', asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = z.object({ status: z.enum(['active', 'paused', 'cancelled']) }).parse(req.body);
    const result = await pool.query("update sequence_enrollments e set status=$3,next_action_at=coalesce(next_action_at,now()) from sequences s where e.sequence_id=s.id and s.id=$1 and s.organization_id=$2 and e.status in ('active','paused') and ($3 <> 'active' or not exists(select 1 from sequence_actions a where a.enrollment_id=e.id and a.state in ('failed','unknown','processing','skipped'))) returning e.id", [req.params.id, auth.org, body.status]);
    res.json({ updated: result.rowCount });
}));
//# sourceMappingURL=sequences.js.map