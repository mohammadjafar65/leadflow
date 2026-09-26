import { Worker, type Job } from "bullmq";
import { pool } from "../db/pool.js";
import { queueConnection } from "../db/redis.js";
import { crawlWebsite } from "../lib/crawler.js";

export const ENRICH_QUEUE_NAME = "enrich";

export interface EnrichJobData {
  leadId: string;
  orgId: string;
}

/**
 * Enriches a single lead by crawling its website, extracting email/socials,
 * writing enrichment_records, and recalculating the lead's quality score.
 */
export async function enrichLead(leadId: string, orgId?: string): Promise<{ email?: string; score: number }> {
  const query = orgId
    ? "select id, organization_id, name, category, website, phone_e164, address, rating from leads where id = $1 and organization_id = $2"
    : "select id, organization_id, name, category, website, phone_e164, address, rating from leads where id = $1";
  const params = orgId ? [leadId, orgId] : [leadId];
  const { rows } = await pool.query(query, params);
  const lead = rows[0];
  if (!lead) return { score: 0 };

  let extractedEmail: string | undefined;

  if (lead.website) {
    const data = await crawlWebsite(lead.website, lead.name);
    extractedEmail = data.email;

    // Delete previous site_scrape enrichment records for this lead to avoid duplicates
    await pool.query(
      "delete from enrichment_records where lead_id = $1 and source = 'site_scrape'",
      [leadId],
    );

    await pool.query("insert into enrichment_records (lead_id,field,value,source,confidence,source_url) values ($1,'source_url',$2,'site_scrape',1,$2)",[leadId,data.sourceUrl??lead.website]);
    if (data.email) {
      await pool.query(
        `insert into enrichment_records (lead_id, field, value, source, confidence)
         values ($1, 'email', $2, 'site_scrape', 0.90)`,
        [leadId, data.email],
      );
    }

    if (data.socials.linkedin) {
      await pool.query(
        `insert into enrichment_records (lead_id, field, value, source, confidence)
         values ($1, 'linkedin_url', $2, 'site_scrape', 0.90)`,
        [leadId, data.socials.linkedin],
      );
    }
    if (data.socials.instagram) {
      await pool.query(
        `insert into enrichment_records (lead_id, field, value, source, confidence)
         values ($1, 'instagram_url', $2, 'site_scrape', 0.85)`,
        [leadId, data.socials.instagram],
      );
    }
    if (data.socials.facebook) {
      await pool.query(
        `insert into enrichment_records (lead_id, field, value, source, confidence)
         values ($1, 'facebook_url', $2, 'site_scrape', 0.85)`,
        [leadId, data.socials.facebook],
      );
    }
    if (data.metaDescription) {
      await pool.query(
        `insert into enrichment_records (lead_id, field, value, source, confidence)
         values ($1, 'meta_description', $2, 'site_scrape', 0.80)`,
        [leadId, data.metaDescription],
      );
    }

    await pool.query(
      `insert into lead_activities (lead_id, user_id, type, payload)
       values ($1, null, 'enriched', $2)`,
      [leadId, JSON.stringify({ email: data.email, socials: data.socials })],
    );
  }

  // Calculate Lead Score (PRD FR-2.4)
  const fields = [lead.website, lead.phone_e164, lead.address, lead.category, lead.rating, extractedEmail];
  const filledCount = fields.filter(Boolean).length;
  const completeness = Math.round((filledCount / fields.length) * 25);
  const industryMatch = lead.category ? 25 : 0;
  const hasWebsite = Boolean(lead.website);
  const websiteQuality = (hasWebsite ? 12 : 0) + (extractedEmail ? 8 : 0);
  const engagement = 0;

  const scoreBreakdown = { completeness, industryMatch, websiteQuality, engagement };
  const score = completeness + industryMatch + websiteQuality + engagement;

  await pool.query(
    "update leads set score = $1, score_breakdown = $2, updated_at = now() where id = $3",
    [score, JSON.stringify(scoreBreakdown), leadId],
  );

  return { email: extractedEmail, score };
}

async function processEnrich(job: Job<EnrichJobData>) {
  const { leadId, orgId } = job.data;
  try {
    const result=await enrichLead(leadId, orgId);
    await pool.query("update enrichment_outbox set state='completed',error=null,updated_at=now() where lead_id=$1 and organization_id=$2",[leadId,orgId]);
    return result;
  } catch(e) {
    if(job.attemptsMade+1 >= (job.opts.attempts??1)) await pool.query("update enrichment_outbox set state='failed',error=$2,updated_at=now() where lead_id=$1",[leadId,e instanceof Error?e.message:'Enrichment failed']);
    throw e;
  }
}

export function startEnrichWorker() {
  const worker = new Worker<EnrichJobData>(ENRICH_QUEUE_NAME, (job) => processEnrich(job), {
    connection: queueConnection,
    concurrency: 3,
  });

  worker.on("failed", (job, err) => {
    console.error(`[enrich-worker] job ${job?.id} failed:`, err.message);
  });

  return worker;
}
