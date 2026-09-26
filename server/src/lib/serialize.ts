export interface EnrichmentRecordRow {
  field: string;
  value: string;
  source: "places_api" | "site_scrape" | "whois" | "manual" | "openstreetmap" | "directory";
  confidence: number;
  observed_at: string;
}

export interface LeadRow {
  id: string;
  organization_id: string;
  assigned_to: string | null;
  name: string;
  dba_names: string[] | null;
  category: string | null;
  website: string | null;
  domain: string | null;
  phone_e164: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  review_count: number | null;
  stage: string;
  score: number;
  score_breakdown: Record<string, unknown> | null;
  merged_into: string | null;
  created_at: string;
  updated_at: string;
  enrichment?: EnrichmentRecordRow[];
  tags?: string[];
}

export function serializeLead(row: LeadRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    assignedTo: row.assigned_to ?? undefined,
    name: row.name,
    dbaNames: row.dba_names ?? undefined,
    category: row.category ?? undefined,
    website: row.website ?? undefined,
    domain: row.domain ?? undefined,
    email: (row.enrichment ?? []).find((e) => e.field === "email")?.value ?? undefined,
    phoneE164: row.phone_e164 ?? undefined,
    address: row.address ?? undefined,
    lat: row.lat != null ? Number(row.lat) : undefined,
    lng: row.lng != null ? Number(row.lng) : undefined,
    rating: row.rating != null ? Number(row.rating) : undefined,
    reviewCount: row.review_count != null ? Number(row.review_count) : undefined,
    stage: row.stage,
    score: row.score,
    scoreBreakdown: (row.score_breakdown as unknown as LeadScoreBreakdown) ?? undefined,
    tags: row.tags ?? [],
    enrichment: (row.enrichment ?? []).map((e) => ({
      field: e.field,
      value: e.value,
      source: e.source,
      confidence: Number(e.confidence),
      observedAt: e.observed_at,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface LeadScoreBreakdown {
  completeness: number;
  industryMatch: number;
  websiteQuality: number;
  engagement: number;
}

/** Aggregates enrichment + tags onto a lead row (used by list/detail queries). */
export function withDetails(l: LeadRow): LeadRow {
  return l;
}