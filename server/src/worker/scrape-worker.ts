import { Worker, type Job } from "bullmq";
import { pool } from "../db/pool.js";
import { queueConnection } from "../db/redis.js";
import { type PlaceResult } from "../lib/places.js";
import { findDedupMatch, normalizeDomain, normalizePhone, type DedupCandidate } from "../lib/dedup.js";
import { completeJob, setJobStatus, updateJobProgress } from "../lib/jobs.js";
import { consumePlacesBudget } from "../routes/places.js";

import type { ScrapeJobData } from "../queue.js";
import { searchOpenData } from "../lib/discovery/service.js";


export const SCRAPE_WORKER = "scrape-worker";

interface OrgLeadIndex {
  candidates: DedupCandidate[];
  byPhone: Map<string, string>;
  byDomain: Map<string, string>;
}

async function loadOrgLeads(orgId: string): Promise<OrgLeadIndex> {
  const { rows } = await pool.query(
    `select id, name, phone_e164, domain, website, lat, lng, updated_at from leads
     where organization_id = $1 and merged_into is null`,
    [orgId],
  );
  const candidates: DedupCandidate[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    phoneE164: r.phone_e164,
    phone_e164: r.phone_e164,
    domain: r.domain || (r.website ? normalizeDomain(r.website) : null),
    website: r.website,
    lat: r.lat ? Number(r.lat) : null,
    lng: r.lng ? Number(r.lng) : null,
    updatedAt: r.updated_at,
    updated_at: r.updated_at,
  }));
  const byPhone = new Map<string, string>();
  const byDomain = new Map<string, string>();
  for (const c of candidates) {
    const p = normalizePhone(c.phoneE164);
    const d = normalizeDomain(c.domain);
    if (p) byPhone.set(p, c.id);
    if (d) byDomain.set(d, c.id);
  }
  return { candidates, byPhone, byDomain };
}

function placeToLeadRow(orgId: string, p: PlaceResult) {
  const normPhone = normalizePhone(p.phone);
  const normDomain = normalizeDomain(p.website);
  return {
    organization_id: orgId,
    name: p.name,
    category: p.category ? getCategoryByKeyword(p.category) : null,
    website: p.website ?? null,
    domain: normDomain,
    phone_e164: normPhone,
    phoneE164: normPhone,
    address: p.address || null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    rating: p.rating ?? null,
    review_count: p.reviewCount ?? null,
  };
}

function getCategoryByKeyword(keyword: string): string | null {
  // keep the Places primary type as the lead category; taxonomy matching is
  // refined in Phase 2's ICP scoring
  return keyword;
}

const PLACE_FIELDS: { field: string; value: (p: PlaceResult) => string | null }[] = [
  { field: "name", value: (p) => p.name },
  { field: "phone", value: (p) => p.phone ?? null },
  { field: "website", value: (p) => p.website ?? null },
  { field: "address", value: (p) => p.address || null },
  { field: "category", value: (p) => p.category ?? null },
  { field: "rating", value: (p) => (p.rating != null ? String(p.rating) : null) },
  { field: "opening_hours", value: (p) => (p.openingHours?.length ? p.openingHours.join("\n") : null) },
];

/** Writes one lead (insert or merge-into-duplicate), returning dedup outcome. */
async function writeLead(client: { query: (q: string, p: unknown[]) => Promise<unknown> }, orgId: string, place: PlaceResult, idx: OrgLeadIndex) {
  if (place.staging || !place.sourceUrl || !place.source) throw new Error("Unverified or synthetic source record rejected");
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [orgId]);
  const existing = await client.query("select lead_id from lead_sources where organization_id=$1 and provider=$2 and external_id=$3", [orgId, place.source, place.id]) as {rows:{lead_id:string}[]};
  if(existing.rows[0]) return {outcome:"merged" as const, reason:"source_identity",leadId:existing.rows[0].lead_id,hasWebsite:Boolean(place.website)};
  const row = placeToLeadRow(orgId, place);
  const dedup = place.source === "openstreetmap" ? null : findDedupMatch(row, idx.candidates);

  if (dedup) {
    // Merge: keep the existing row, log the signal, copy provenance records.
    await client.query(
      `insert into lead_activities (lead_id, user_id, type, payload)
       values ($1, null, 'dedup_skipped', $2)`,
      [dedup.candidateId, JSON.stringify({ reason: dedup.reason, name: place.name })],
    );
    const candidate = idx.candidates.find((c) => c.id === dedup.candidateId);
    if (candidate) {
      // freshest name/phone/website wins for a merged record (FR-1.5)
      await client.query(
        `update leads set
           name = case when $2::text is not null and length($2) > length(name) then $2 else name end,
           phone_e164 = coalesce(phone_e164, $3),
           website = coalesce(website, $4),
           lat = coalesce(lat, $5), lng = coalesce(lng, $6),
           updated_at = now()
         where id = $1`,
        [dedup.candidateId, place.name, row.phone_e164, row.website, row.lat, row.lng],
      );
    }
    await client.query("insert into lead_sources (organization_id,provider,external_id,lead_id,source_url,attribution) values ($1,$2,$3,$4,$5,$6) on conflict do nothing", [orgId,place.source,place.id,dedup.candidateId,place.sourceUrl,place.attribution??place.source]);
    return { outcome: "merged" as const, reason: dedup.reason, leadId: dedup.candidateId, hasWebsite: Boolean(row.website) };
  }

  const inserted = await client.query(
    `insert into leads (organization_id, name, category, website, phone_e164, address, lat, lng, rating, review_count)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id`,
    [row.organization_id, row.name, row.category, row.website, row.phone_e164, row.address, row.lat, row.lng, row.rating, row.review_count],
  );
  const leadId = (inserted as { rows: { id: string }[] }).rows[0].id;

  await client.query("insert into lead_sources (organization_id,provider,external_id,lead_id,source_url,attribution) values ($1,$2,$3,$4,$5,$6)", [orgId,place.source,place.id,leadId,place.sourceUrl,place.attribution??place.source]);
  const records = [...PLACE_FIELDS, {field:"source_url",value:(p:PlaceResult)=>p.sourceUrl??null}, {field:"email",value:(p:PlaceResult)=>p.email??null} ].map((f) => ({ field: f.field, val: f.value(place) })).filter(
    (r): r is { field: string; val: string } => Boolean(r.val),
  );
  if (records.length > 0) {
    const valueClauses = records
      .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3}, 'openstreetmap', 1.0)`)
      .join(", ");
    const params: unknown[] = [leadId];
    for (const r of records) {
      params.push(r.field, r.val);
    }
    await client.query(
      `insert into enrichment_records (lead_id, field, value, source, confidence) values ${valueClauses}`,
      params,
    );
  }
  await client.query(
    `insert into lead_activities (lead_id, user_id, type, payload) values ($1, null, 'created', $2)`,
    [leadId, JSON.stringify({ source: place.source, sourceUrl:place.sourceUrl, attribution:place.attribution })],
  );

  idx.candidates.push({
    id: leadId,
    name: row.name,
    phoneE164: row.phone_e164,
    phone_e164: row.phone_e164,
    domain: row.domain || (row.website ? normalizeDomain(row.website) : null),
    website: row.website,
    lat: row.lat,
    lng: row.lng,
    updatedAt: new Date().toISOString(),
  });
  if (row.phone_e164) idx.byPhone.set(row.phone_e164, leadId);
  if (row.domain || row.website) idx.byDomain.set(row.domain ?? normalizeDomain(row.website) ?? "", leadId);

  return { outcome: "created" as const, reason: null, leadId, hasWebsite: Boolean(row.website) };
}

export async function processScrape(job: { data: ScrapeJobData } | Job<ScrapeJobData>) {
  const { orgId, params } = job.data;
  const jobId = job.data.jobId;

  // Atomically claim the job to prevent duplicate execution between direct call and BullMQ
  const claim = await pool.query(
    `update jobs set status = 'running', updated_at = now() where id = $1 and status in ('queued','running') returning id`,
    [jobId],
  );
  if (claim.rowCount === 0) {
    // Already claimed or running
    return;
  }

  const stats = { processed: 0, created: 0, merged: 0, pages: 0 };

  try {
    await updateJobProgress(jobId, { processed: 0, created: 0, merged: 0, total: 20 });

    const idx = await loadOrgLeads(orgId);

    let pageToken: string | undefined;
    const maxPages = params.limit ? Math.ceil(params.limit / 20) : 3;
    const source = params.source || "openstreetmap";
    
    do {
      let page: { places: PlaceResult[]; nextPageToken: string | null; totalEstimate: number | null };
      
      if (source !== "openstreetmap") throw new Error("Choose the free open-data source");
      const state = await pool.query("select status from jobs where id=$1 and organization_id=$2",[jobId,orgId]);
      if(state.rows[0]?.status === "cancelled") return stats;
      await consumePlacesBudget(orgId);
      page = await searchOpenData({region:params.region,categories:params.categories,pageToken,limit:Math.min(20,(params.limit??60)-stats.processed)});
      stats.pages++;

      const client = await pool.connect();

      try {
        await client.query("begin");
        const active=await client.query("select status from jobs where id=$1 for update",[jobId]);
        if(active.rows[0]?.status==='cancelled') {await client.query('rollback');return stats;}
        let batchCount = 0;
        for (const place of page.places) {
          stats.processed += 1;
          batchCount += 1;
          const r = await writeLead(client as never, orgId, place, idx);
          if (r.outcome === "created") {
            stats.created += 1;
            if(r.hasWebsite) await client.query("insert into enrichment_outbox (lead_id,organization_id) values ($1,$2) on conflict do nothing",[r.leadId,orgId]);
          } else {
            stats.merged += 1;
          }
          // Periodically update progress every 2 leads during processing
          if (batchCount % 2 === 0 || stats.processed === page.places.length) {
            void updateJobProgress(jobId, {
              ...stats,
              total: page.totalEstimate ?? Math.max(stats.processed, stats.processed + (page.nextPageToken ? 20 : 0)),
            });
          }
        }
        await client.query("commit");
        await updateJobProgress(jobId, {
          ...stats,
          total: page.totalEstimate ?? Math.max(stats.processed, stats.processed + (page.nextPageToken ? 20 : 0)),
        });
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }


      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken && stats.pages < maxPages);

    await completeJob(jobId, { ...stats, total: stats.processed });
    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scrape-worker] Error in processScrape for job ${jobId}:`, err);
    try {
      await setJobStatus(jobId, "failed", { error: message });
    } catch {
      /* ignore */
    }
    return { ...stats, error: message };
  }
}

export function startScrapeWorker() {
  const worker = new Worker<ScrapeJobData>("scrape", (job) => processScrape(job), {
    connection: queueConnection,
    concurrency: 2,
  });
  worker.on("failed", (job, err) => {
    console.error(`[${SCRAPE_WORKER}] job ${job?.id} failed:`, err.message);
  });
  worker.on("completed", (job) => {
    console.log(`[${SCRAPE_WORKER}] job ${job.id} completed`);
  });
  return worker;
}

// Scaffolding for the enrich worker lands in Phase 2. The scrape worker will
// enqueue one `enrich` job per lead with a website URL at that point.