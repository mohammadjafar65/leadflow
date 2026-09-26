import type { Lead, ScoreBreakdown } from "@/types/lead";

/**
 * Rules-based v1 scorer (PRD FR-2.4). Kept pure/deterministic and separate
 * from any ML-based scoring so it stays auditable — every score is
 * explainable via the returned breakdown, shown in ScoreRing's tooltip.
 */
export function computeLeadScore(lead: Lead, icpCategories: string[]): { score: number; breakdown: ScoreBreakdown } {
  const fields: (keyof Lead)[] = ["website", "phoneE164", "address", "category", "rating"];
  const filled = fields.filter((f) => Boolean(lead[f])).length;
  const completeness = Math.round((filled / fields.length) * 25);

  const industryMatch = lead.category && icpCategories.includes(lead.category) ? 25 : 0;

  const hasWebsite = Boolean(lead.website);
  const hasSocials = lead.enrichment.some((e) => e.field.includes("_url") && e.field !== "website_url");
  const websiteQuality = (hasWebsite ? 12 : 0) + (hasSocials ? 8 : 0);

  // engagement is populated from email_events elsewhere and merged in;
  // defaults to 0 for a freshly extracted lead.
  const engagement = lead.scoreBreakdown?.engagement ?? 0;

  const breakdown: ScoreBreakdown = { completeness, industryMatch, websiteQuality, engagement };
  const score = completeness + industryMatch + websiteQuality + engagement;
  return { score, breakdown };
}
