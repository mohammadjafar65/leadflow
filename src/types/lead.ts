export type PipelineStage =
  | "new_lead" | "contacted" | "responded" | "qualified" | "closed" | "archived";

export type EnrichmentSource = "places_api" | "site_scrape" | "whois" | "manual" | "openstreetmap" | "directory";

export interface EnrichmentRecord {
  field: string;
  value: string;
  source: EnrichmentSource;
  confidence: number;       // 0..1
  observedAt: string;       // ISO timestamp
}

export interface ScoreBreakdown {
  completeness: number;   // 0..25
  industryMatch: number;  // 0..25
  websiteQuality: number; // 0..20
  engagement: number;     // 0..30
}

export interface Lead {
  id: string;
  organizationId: string;
  assignedTo?: string;
  name: string;
  dbaNames?: string[];
  category?: string;
  website?: string;
  domain?: string;
  email?: string;
  phoneE164?: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewCount?: number;
  stage: PipelineStage;
  score: number;
  scoreBreakdown?: ScoreBreakdown;
  tags: string[];
  enrichment: EnrichmentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadSearchParams {
  source?: "openstreetmap";
  region: { type: "city" | "radius"; query?: string; center?: { lat: number; lng: number }; radiusMeters?: number };
  categories: string[];
  limit?: number;
}

export interface AuditPillarScore {
  score: number; // 0..100
  status: "good" | "needs_improvement" | "poor" | "not_measured";
  summary: string;
  details: string[];
}

export interface AuditFinding {
  area: "Conversion" | "Mobile" | "Performance" | "Trust" | "SEO" | "UX" | "Technical" | "Security";
  title: string;
  technicalCause: string;
  businessImpact: string;
  solution: string;
  severity: "high" | "medium" | "low";
}

export interface AuditReport {
  id?: string;
  leadId?: string;
  websiteUrl?: string;
  overallScore: number;
  qualificationScore: number;
  isIcp: boolean;
  icpReason: string;
  isParkedOrDead?: boolean;
  siteStatus?: "active" | "parked" | "dead";
  parkedProvider?: string;
  techStack: string[];
  pillars: {
    performance: AuditPillarScore;
    mobile: AuditPillarScore;
    ux: AuditPillarScore;
    conversion: AuditPillarScore;
    seo: AuditPillarScore;
    technical: AuditPillarScore;
    security: AuditPillarScore;
  };
  findings: AuditFinding[];
  positiveObservation: string;
  priorityRecommendation: string;
  priorityBenefit: string;
  generatedEmail: {
    subject: string;
    bodyText: string;
    bodyHtml: string;
  };
  createdAt?: string;
  auditedAt?: string;
}

