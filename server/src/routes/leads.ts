import { Router } from "express";
import { z } from "zod";
import { pool, type Queryable } from "../db/pool.js";
import { ApiError, assertOrgRow, asyncHandler } from "../lib/http.js";
import { currentAuth, requireAuth, requireRole } from "../middleware/auth.js";
import { idempotent } from "../middleware/idempotency.js";
import { serializeLead, type LeadRow } from "../lib/serialize.js";
import { planMerge, type MergeableFields } from "../lib/dedup.js";
import { scrapeQueue, type ScrapeJobData } from "../queue.js";
import { createJobRow } from "../lib/jobs.js";

import { enrichLead } from "../worker/enrich-worker.js";
import { runWebsiteAudit } from "../lib/audit-engine.js";

export const leadsRouter = Router();
leadsRouter.use(requireAuth);

const STAGES = ["new_lead", "contacted", "responded", "qualified", "closed", "archived"] as const;

const LEAD_COLUMNS = `
  l.id, l.organization_id, l.assigned_to, l.name, l.dba_names, l.category, l.website,
  l.domain, l.phone_e164, l.address, l.lat, l.lng, l.rating, l.review_count,
  l.stage, l.score, l.score_breakdown, l.merged_into, l.created_at, l.updated_at`;

const DETAIL_SELECT = `
  select ${LEAD_COLUMNS},
    coalesce(json_agg(
      jsonb_build_object('field', e.field, 'value', e.value, 'source', e.source,
                         'confidence', e.confidence, 'observed_at', e.observed_at)
    ) filter (where e.id is not null), '[]'::json) as enrichment,
    coalesce((
      select json_agg(t.name) from lead_tags lt join tags t on t.id = lt.tag_id
      where lt.lead_id = l.id
    ), '[]'::json) as tags
  from leads l
  left join enrichment_records e on e.lead_id = l.id`;

/** Org-scoped row guard for leads (never trust a client-supplied org). */
async function getLeadRow(client: Queryable, orgId: string, leadId: string): Promise<LeadRow> {
  const { rows } = await client.query(
    `${DETAIL_SELECT}
     where l.id = $1 and l.organization_id = $2
     group by l.id`,
    [leadId, orgId],
  );
  return assertOrgRow(rows[0] as LeadRow | undefined, orgId);
}

function decodeCursor(cursor: string | undefined): { created_at: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [createdAt, id] = Buffer.from(cursor, "base64url").toString().split("|");
    if (!createdAt || !id) return null;
    return { created_at: createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(`${row.created_at}|${row.id}`).toString("base64url");
}

const listSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  stage: z.enum(STAGES).optional(),
  category: z.string().optional(),
  scoreMin: z.coerce.number().int().min(0).max(100).optional(),
  scoreMax: z.coerce.number().int().min(0).max(100).optional(),
  tag: z.string().optional(),
  q: z.string().max(200).optional(),
});

leadsRouter.get(
  "/leads",
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const qs = listSchema.parse(req.query);

    const where: string[] = ["l.organization_id = $1", "l.merged_into is null"];
    const params: unknown[] = [auth.org];
    if (qs.stage) {
      params.push(qs.stage);
      where.push(`l.stage = $${params.length}`);
    }
    if (qs.category) {
      params.push(qs.category);
      where.push(`l.category = $${params.length}`);
    }
    if (qs.scoreMin !== undefined) {
      params.push(qs.scoreMin);
      where.push(`l.score >= $${params.length}`);
    }
    if (qs.scoreMax !== undefined) {
      params.push(qs.scoreMax);
      where.push(`l.score <= $${params.length}`);
    }
    if (qs.tag) {
      params.push(qs.tag);
      where.push(`l.id in (select lt.lead_id from lead_tags lt join tags t on t.id = lt.tag_id
                          where t.organization_id = $1 and t.name = $${params.length})`);
    }
    if (qs.q) {
      params.push(`%${qs.q.toLowerCase()}%`);
      where.push(
        `(lower(l.name) like $${params.length} or lower(l.address) like $${params.length}
          or lower(l.domain) like $${params.length} or l.phone_e164 like $${params.length})`,
      );
    }

    const cursor = decodeCursor(qs.cursor);
    if (cursor) {
      params.push(cursor.created_at, cursor.id);
      where.push(`(l.created_at, l.id) < ($${params.length - 1}, $${params.length})`);
    }

    params.push(qs.limit + 1);
    const { rows } = await pool.query(
      `${DETAIL_SELECT}
       where ${where.join(" and ")}
       group by l.id
       order by l.created_at desc, l.id desc
       limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > qs.limit;
    const page = hasMore ? rows.slice(0, qs.limit) : rows;
    res.json({
      items: page.map(serializeLead),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    });
  }),
);

// --- Categories list (for filter dropdown) ---
// Registered before /leads/:id so 'categories' is never parsed as a lead id.

leadsRouter.get(
  "/leads/categories",
  asyncHandler(async (_req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(
      `select distinct category from leads
       where organization_id = $1 and category is not null and merged_into is null
       order by category asc`,
      [auth.org],
    );
    res.json({ categories: rows.map((r) => r.category as string) });
  }),
);

// --- Manual CSV export (Phase 1; field picker + XLSX/JSON in Phase 5) ---
// Registered before /leads/:id so 'export' is never parsed as a lead id.

leadsRouter.get(
  "/leads/export",
  requireRole("owner", "admin", "member"),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const qs = listSchema.parse(req.query);
    const where = ["organization_id = $1"];
    const params: unknown[] = [auth.org];
    if (qs.stage) {
      params.push(qs.stage);
      where.push(`stage = $${params.length}`);
    }
    const { rows } = await pool.query(
      `select name, category, website, domain, phone_e164, address, rating, review_count, stage, score, created_at
       from leads where ${where.join(" and ")} order by created_at desc limit 50000`,
      params,
    );

    const cols = ["name", "category", "website", "domain", "phone_e164", "address", "rating", "review_count", "stage", "score", "created_at"];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="leads.csv"');
    res.send(csv);
  }),
);

leadsRouter.get(
  "/leads/:id",
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const row = await getLeadRow(pool, auth.org, req.params.id);
    res.json({ lead: serializeLead(row) });
  }),
);

const patchSchema = z
  .object({
    stage: z.enum(STAGES).optional(),
    assignedTo: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.stage !== undefined || v.assignedTo !== undefined, {
    message: "at least one of stage / assignedTo is required",
  });

leadsRouter.patch(
  "/leads/:id",
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = patchSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const row = await getLeadRow(client, auth.org, req.params.id);

      const sets: string[] = [];
      const params: unknown[] = [row.id, auth.org];
      const activityType: string[] = [];
      const activityPayload: Record<string, unknown>[] = [];
      if (body.stage !== undefined && body.stage !== row.stage) {
        sets.push(`stage = $${params.length + 1}`);
        params.push(body.stage);
        activityType.push("stage_change");
        activityPayload.push({ from: row.stage, to: body.stage });
      }
      if (body.assignedTo !== undefined && body.assignedTo !== row.assigned_to) {
        sets.push(`assigned_to = $${params.length + 1}`);
        params.push(body.assignedTo);
        activityType.push("assignment");
        activityPayload.push({ to: body.assignedTo, from: row.assigned_to });
      }
      if (sets.length > 0) {
        await client.query(`update leads set ${sets.join(", ")} where id = $1 and organization_id = $2`, params);
      }
      for (let i = 0; i < activityType.length; i++) {
        await client.query(
          "insert into lead_activities (lead_id, user_id, type, payload) values ($1, $2, $3, $4)",
          [row.id, auth.sub, activityType[i], JSON.stringify(activityPayload[i])],
        );
      }
      await client.query("commit");
      const updated = await getLeadRow(pool, auth.org, row.id);
      res.json({ lead: serializeLead(updated) });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }),
);

const extractSchema = z.object({
  source: z.enum(["openstreetmap"]).default("openstreetmap"),
  region: z.discriminatedUnion("type", [
    z.object({ type: z.literal("city"), query: z.string().min(1).max(120) }),
    z.object({
      type: z.literal("radius"),
      center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
      radiusMeters: z.number().int().min(100).max(50000).default(5000),
    }),
  ]),
  categories: z.array(z.string().min(1)).min(1).max(10),
  limit: z.number().int().min(1).max(200).optional(),
});

leadsRouter.post(
  "/leads/extract",
  idempotent,
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = extractSchema.parse(req.body);
    const idemKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : null;

    const jobRow = await createJobRow({
      orgId: auth.org,
      userId: auth.sub,
      kind: "scrape",
      params: body,
      idempotencyKey: idemKey,
    });

    const data: ScrapeJobData = { jobId: jobRow.id, orgId: auth.org, userId: auth.sub, params: body };

    try {
      await scrapeQueue.add("scrape", data, { jobId: jobRow.id, removeOnComplete: {count:1000} });
    } catch {
      await pool.query("update jobs set status='failed', error='Queue unavailable', updated_at=now() where id=$1",[jobRow.id]);
      throw new ApiError(503,"The job queue is unavailable. Please retry.");
    }
    res.status(202).json({ jobId: jobRow.id });
  }),
);

const mergeSchema = z.object({ duplicateId: z.string().uuid() });

leadsRouter.post(
  "/leads/:id/merge",
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const { duplicateId } = mergeSchema.parse(req.body);
    if (duplicateId === req.params.id) throw new ApiError(400, "Cannot merge a lead into itself");

    const client = await pool.connect();
    try {
      await client.query("begin");
      const primary = await getLeadRow(client, auth.org, req.params.id);
      const duplicate = await getLeadRow(client, auth.org, duplicateId);

      const merged = planMerge(
        primary as unknown as MergeableFields,
        duplicate as unknown as MergeableFields,
        primary.updated_at,
        duplicate.updated_at,
      );

      const sets: string[] = [];
      const params: unknown[] = [primary.id, auth.org];
      const fields: (keyof MergeableFields)[] = [
        "name", "category", "website", "phoneE164", "address", "lat", "lng", "rating", "reviewCount", "dbaNames",
      ];
      const columnMap: Record<string, string> = {
        phoneE164: "phone_e164",
        reviewCount: "review_count",
        dbaNames: "dba_names",
      };
      for (const f of fields) {
        const col = columnMap[f] ?? f;
        const val = merged[f] ?? null;
        if (val !== undefined) {
          sets.push(`${col} = $${params.length + 1}`);
          params.push(val);
        }
      }
      if (sets.length > 0) {
        await client.query(
          `update leads set ${sets.join(", ")} where id = $1 and organization_id = $2`,
          params,
        );
      }

      // Append-only merge: copy duplicate's history, never delete it.
      await client.query(
        `insert into enrichment_records (lead_id, field, value, source, confidence, observed_at)
         select $1, e.field, e.value, e.source, e.confidence, e.observed_at
         from enrichment_records e where e.lead_id = $2
           and not exists (
             select 1 from enrichment_records e2
             where e2.lead_id = $1 and e2.field = e.field and e2.value = e.value
           )`,
        [primary.id, duplicate.id],
      );
      await client.query(
        `insert into lead_activities (lead_id, user_id, type, payload, created_at)
         select $1, a.user_id, a.type, a.payload, a.created_at
         from lead_activities a where a.lead_id = $2`,
        [primary.id, duplicate.id],
      );
      await client.query("update leads set merged_into = $1 where id = $2", [primary.id, duplicate.id]);
      await client.query(
        "insert into lead_activities (lead_id, user_id, type, payload) values ($1, $2, 'merged', $3)",
        [primary.id, auth.sub, JSON.stringify({ duplicateId, source: "manual" })],
      );
      await client.query("commit");

      const updated = await getLeadRow(pool, auth.org, primary.id);
      res.json({ lead: serializeLead(updated) });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }),
);

leadsRouter.post(
  "/leads/:id/enrich",
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const lead = await getLeadRow(pool, auth.org, req.params.id);
    await enrichLead(lead.id, auth.org);
    const updated = await getLeadRow(pool, auth.org, lead.id);
    res.json({ lead: serializeLead(updated) });
  }),
);

leadsRouter.post(
  "/leads/:id/audit",
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const lead = await getLeadRow(pool, auth.org, req.params.id);
    if (!lead.website) {
      throw new ApiError(400, "Lead does not have a website to audit");
    }

    const contactName = (lead.enrichment as { field: string; value: string }[])?.find(
      (e) => e.field === "owner_name" || e.field === "founder" || e.field === "contact_name",
    )?.value;

    const report = await runWebsiteAudit({
      leadId: lead.id,
      companyName: lead.name,
      websiteUrl: lead.website,
      category: lead.category ?? undefined,
      rating: lead.rating ? Number(lead.rating) : undefined,
      reviewCount: lead.review_count ? Number(lead.review_count) : undefined,
      contactName,
    });

    const scoresPayload = {
      pillars: report.pillars,
      positiveObservation: report.positiveObservation,
      priorityRecommendation: report.priorityRecommendation,
      priorityBenefit: report.priorityBenefit,
      icpReason: report.icpReason,
      isParkedOrDead: report.isParkedOrDead ?? false,
      siteStatus: report.siteStatus ?? "active",
      parkedProvider: report.parkedProvider ?? null,
    };

    const { rows } = await pool.query(
      `insert into website_audits (
         organization_id, lead_id, website_url, overall_score, qualification_score, is_icp,
         scores, findings, tech_stack, generated_email, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
       returning id, created_at`,
      [
        auth.org,
        lead.id,
        lead.website,
        report.overallScore,
        report.qualificationScore,
        report.isIcp,
        JSON.stringify(scoresPayload),
        JSON.stringify(report.findings),
        JSON.stringify(report.techStack),
        JSON.stringify(report.generatedEmail),
      ],
    );

    await pool.query(
      `insert into lead_activities (lead_id, user_id, type, payload)
       values ($1, $2, 'website_audit_run', $3)`,
      [
        lead.id,
        auth.sub,
        JSON.stringify({
          auditId: rows[0].id,
          overallScore: report.overallScore,
          isIcp: report.isIcp,
          findingsCount: report.findings.length,
          isParkedOrDead: report.isParkedOrDead ?? false,
        }),
      ],
    );

    res.json({
      audit: {
        id: rows[0].id,
        ...report,
        createdAt: rows[0].created_at,
      },
    });
  }),
);

leadsRouter.get(
  "/leads/:id/audit",
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(
      `select id, lead_id, website_url, overall_score, qualification_score, is_icp,
              scores, findings, tech_stack, generated_email, created_at, updated_at
       from website_audits
       where lead_id = $1 and organization_id = $2
       order by created_at desc
       limit 1`,
      [req.params.id, auth.org],
    );

    if (!rows[0]) {
      res.json({ audit: null });
      return;
    }

    const r = rows[0];
    const scores = (typeof r.scores === "string" ? JSON.parse(r.scores) : r.scores) || {};
    const findings = (typeof r.findings === "string" ? JSON.parse(r.findings) : r.findings) || [];
    const techStack = (typeof r.tech_stack === "string" ? JSON.parse(r.tech_stack) : r.tech_stack) || [];
    const generatedEmail = (typeof r.generated_email === "string" ? JSON.parse(r.generated_email) : r.generated_email) || {};

    res.json({
      audit: {
        id: r.id,
        leadId: r.lead_id,
        websiteUrl: r.website_url,
        overallScore: r.overall_score,
        qualificationScore: r.qualification_score,
        isIcp: r.is_icp,
        icpReason: scores.icpReason ?? "",
        isParkedOrDead: scores.isParkedOrDead ?? false,
        siteStatus: scores.siteStatus ?? "active",
        parkedProvider: scores.parkedProvider ?? undefined,
        techStack,
        pillars: scores.pillars ?? {},
        findings,
        positiveObservation: scores.positiveObservation ?? "",
        priorityRecommendation: scores.priorityRecommendation ?? "",
        priorityBenefit: scores.priorityBenefit ?? "",
        generatedEmail,
        createdAt: r.created_at,
      },
    });
  }),
);

leadsRouter.delete(
  "/leads/:id",
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    // Verify ownership before deleting
    await getLeadRow(pool, auth.org, req.params.id);

    const client = await pool.connect();
    try {
      await client.query("begin");
      // Delete all related records first (cascade order)
      await client.query(
        "delete from email_events where lead_id = $1 or enrollment_id in (select id from sequence_enrollments where lead_id = $1)",
        [req.params.id],
      );
      await client.query("delete from sequence_enrollments where lead_id = $1", [req.params.id]);
      await client.query("delete from enrichment_records where lead_id = $1", [req.params.id]);
      await client.query("delete from lead_activities where lead_id = $1", [req.params.id]);
      await client.query("delete from lead_tags where lead_id = $1", [req.params.id]);
      await client.query("delete from website_audits where lead_id = $1", [req.params.id]);
      // Remove from any campaign queues
      await client.query("delete from campaign_leads where lead_id = $1", [req.params.id]);
      // Unlink any leads that were merged into this one or have merged_into set
      await client.query(
        "update leads set merged_into = null where merged_into = $1 or id = $1",
        [req.params.id],
      );
      await client.query(
        "delete from leads where id = $1 and organization_id = $2",
        [req.params.id, auth.org],
      );
      await client.query("commit");
      res.status(204).end();
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }),
);

const batchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

leadsRouter.post(
  "/leads/batch-delete",
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const { ids } = batchDeleteSchema.parse(req.body);

    const client = await pool.connect();
    try {
      await client.query("begin");
      // Find leads that belong to this organization
      const { rows } = await client.query(
        "select id from leads where id = any($1::uuid[]) and organization_id = $2",
        [ids, auth.org],
      );
      const validIds = rows.map((r: { id: string }) => r.id);

      if (validIds.length > 0) {
        // Delete related email events and sequence enrollments first
        await client.query(
          "delete from email_events where lead_id = any($1::uuid[]) or enrollment_id in (select id from sequence_enrollments where lead_id = any($1::uuid[]))",
          [validIds],
        );
        await client.query(
          "delete from sequence_enrollments where lead_id = any($1::uuid[])",
          [validIds],
        );
        await client.query("delete from enrichment_records where lead_id = any($1::uuid[])", [validIds]);
        await client.query("delete from lead_activities where lead_id = any($1::uuid[])", [validIds]);
        await client.query("delete from lead_tags where lead_id = any($1::uuid[])", [validIds]);
        await client.query("delete from website_audits where lead_id = any($1::uuid[])", [validIds]);
        await client.query("delete from campaign_leads where lead_id = any($1::uuid[])", [validIds]);
        await client.query(
          "update leads set merged_into = null where merged_into = any($1::uuid[]) or id = any($1::uuid[])",
          [validIds],
        );
        await client.query(
          "delete from leads where id = any($1::uuid[]) and organization_id = $2",
          [validIds, auth.org],
        );
      }
      await client.query("commit");
      res.json({ deletedCount: validIds.length });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }),
);

const batchStageSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  stage: z.enum(STAGES),
});

leadsRouter.post(
  "/leads/batch-stage",
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const { ids, stage } = batchStageSchema.parse(req.body);

    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query(
        "select id, stage from leads where id = any($1::uuid[]) and organization_id = $2 and merged_into is null",
        [ids, auth.org],
      );
      const validIds = rows.map((r: { id: string; stage: string }) => r.id);

      if (validIds.length > 0) {
        await client.query(
          "update leads set stage = $1, updated_at = now() where id = any($2::uuid[]) and organization_id = $3",
          [stage, validIds, auth.org],
        );

        for (const row of rows) {
          if (row.stage !== stage) {
            await client.query(
              "insert into lead_activities (lead_id, user_id, type, payload) values ($1, $2, 'stage_change', $3)",
              [row.id, auth.sub, JSON.stringify({ from: row.stage, to: stage })],
            );
          }
        }
      }
      await client.query("commit");
      res.json({ updatedCount: validIds.length });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }),
);
