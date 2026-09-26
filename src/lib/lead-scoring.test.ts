import { describe, expect, it } from "vitest";
import { computeLeadScore } from "./lead-scoring";
import type { Lead } from "@/types/lead";

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    organizationId: "o1",
    name: "Test Business",
    stage: "new_lead",
    score: 0,
    tags: [],
    enrichment: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeLeadScore", () => {
  it("scores 0 for an empty lead", () => {
    const { score, breakdown } = computeLeadScore(baseLead(), ["restaurant"]);
    expect(score).toBe(0);
    expect(breakdown).toEqual({ completeness: 0, industryMatch: 0, websiteQuality: 0, engagement: 0 });
  });

  it("rewards completeness", () => {
    const lead = baseLead({
      website: "https://acme.com",
      phoneE164: "+14155552671",
      address: "1 Main St",
      category: "restaurant",
      rating: 4.5,
    });
    const { score, breakdown } = computeLeadScore(lead, ["restaurant"]);
    expect(breakdown.completeness).toBe(25);
    expect(score).toBeGreaterThanOrEqual(50);
  });

  it("gives industry match only when the ICP includes the category", () => {
    const lead = baseLead({ category: "dental_clinic" });
    const inIcp = computeLeadScore(lead, ["dental_clinic"]);
    const outIcp = computeLeadScore(lead, ["restaurant"]);
    expect(inIcp.breakdown.industryMatch).toBe(25);
    expect(outIcp.breakdown.industryMatch).toBe(0);
  });

  it("adds website-quality points for a site plus social links", () => {
    const lead = baseLead({
      website: "https://acme.com",
      enrichment: [
        { field: "linkedin_url", value: "https://linkedin.com/company/acme", source: "site_scrape", confidence: 0.9, observedAt: new Date().toISOString() },
        { field: "instagram_url", value: "https://instagram.com/acme", source: "site_scrape", confidence: 0.8, observedAt: new Date().toISOString() },
      ],
    });
    const { breakdown } = computeLeadScore(lead, []);
    expect(breakdown.websiteQuality).toBe(20);
  });

  it("keeps a provided engagement component", () => {
    const lead = baseLead({ scoreBreakdown: { completeness: 0, industryMatch: 0, websiteQuality: 0, engagement: 30 } });
    const { score, breakdown } = computeLeadScore(lead, []);
    expect(breakdown.engagement).toBe(30);
    expect(score).toBe(30);
  });

  it("caps the total at 100", () => {
    const lead = baseLead({
      website: "https://acme.com",
      phoneE164: "+14155552671",
      address: "1 Main St",
      category: "restaurant",
      rating: 4.5,
      enrichment: [
        { field: "linkedin_url", value: "https://linkedin.com/company/acme", source: "site_scrape", confidence: 0.9, observedAt: new Date().toISOString() },
      ],
      scoreBreakdown: { completeness: 0, industryMatch: 0, websiteQuality: 0, engagement: 30 },
    });
    const { score } = computeLeadScore(lead, ["restaurant"]);
    expect(score).toBeLessThanOrEqual(100);
  });
});