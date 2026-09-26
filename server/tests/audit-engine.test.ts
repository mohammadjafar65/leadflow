import { describe, it, expect } from "vitest";
import { evaluateProspectQualification, runWebsiteAudit } from "../src/lib/audit-engine.js";

describe("Audit Engine - MZI Studio Prospect Scoring & Website Audit", () => {
  describe("evaluateProspectQualification", () => {
    it("qualifies established businesses in target categories as ICP", () => {
      const result = evaluateProspectQualification({
        category: "Software Company",
        rating: 4.8,
        reviewCount: 42,
        hasWebsite: true,
      });

      expect(result.isIcp).toBe(true);
      expect(result.qualificationScore).toBeGreaterThanOrEqual(70);
      expect(result.reason).toContain("High-value commercial sector");
    });

    it("identifies high-volume local service businesses as qualified", () => {
      const result = evaluateProspectQualification({
        category: "Dental Clinic",
        rating: 4.5,
        reviewCount: 110,
        hasWebsite: true,
      });

      expect(result.isIcp).toBe(true);
      expect(result.qualificationScore).toBeGreaterThanOrEqual(70);
    });

    it("flags businesses without websites as non-ICP", () => {
      const result = evaluateProspectQualification({
        category: "Restaurant",
        rating: 4.2,
        reviewCount: 20,
        hasWebsite: false,
      });

      expect(result.isIcp).toBe(false);
      expect(result.qualificationScore).toBeLessThan(50);
      expect(result.reason).toContain("No website exists");
    });
  });

  describe("runWebsiteAudit", () => {
    it("generates an 8-pillar audit with 3 to 5 business-impact findings and cold email", async () => {
      const report = await runWebsiteAudit({
        leadId: "00000000-0000-0000-0000-000000000001",
        companyName: "Apex Digital Solutions",
        websiteUrl: "https://apexdigitalsolutions.example.com",
        category: "Technology",
        rating: 4.9,
        reviewCount: 55,
        contactName: "Sarah Jenkins",
      });

      // 1. Overall & Qualification
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(report.isIcp).toBe(true);

      // 2. 8 Pillars
      expect(report.pillars).toBeDefined();
      expect(report.pillars.performance).toBeDefined();
      expect(report.pillars.mobile).toBeDefined();
      expect(report.pillars.ux).toBeDefined();
      expect(report.pillars.conversion).toBeDefined();
      expect(report.pillars.seo).toBeDefined();
      expect(report.pillars.technical).toBeDefined();
      expect(report.pillars.security).toBeDefined();

      // 3. Tech stack
      expect(Array.isArray(report.techStack)).toBe(true);
      expect(report.techStack.length).toBeGreaterThan(0);

      // 4. Exactly 3 to 5 Findings rule
      expect(report.findings.length).toBeGreaterThanOrEqual(3);
      expect(report.findings.length).toBeLessThanOrEqual(5);

      for (const finding of report.findings) {
        expect(finding.area).toBeDefined();
        expect(finding.title).toBeTruthy();
        expect(finding.technicalCause).toBeTruthy();
        expect(finding.businessImpact).toBeTruthy();
        expect(finding.solution).toBeTruthy();
      }

      // 5. MZI Studio cold outreach email
      expect(report.generatedEmail).toBeDefined();
      expect(report.generatedEmail.subject).toBe("Quick observation about Apex Digital Solutions's website");
      expect(report.generatedEmail.bodyText).toContain("Hi Sarah");
      expect(report.generatedEmail.bodyText).toContain("The three that stood out most");
      expect(report.generatedEmail.bodyText).toContain("Mohammad from MZI Studio");
      expect(report.generatedEmail.bodyText).toContain("5-minute walkthrough");
      expect(report.generatedEmail.bodyText).toContain("Mohammad Jafar");
      expect(report.generatedEmail.bodyText).toContain("MZI Studio");
      expect(report.generatedEmail.bodyHtml).toContain("<ol>");
    });

    it("detects parked domains and generates Track 2 No-Website outreach", async () => {
      const report = await runWebsiteAudit({
        leadId: "00000000-0000-0000-0000-000000000002",
        companyName: "Maple Table",
        websiteUrl: "https://parked-mapletable.example.com",
        category: "Restaurant",
        rating: 4.6,
        reviewCount: 78,
      });

      expect(report.isParkedOrDead).toBe(true);
      expect(report.siteStatus).toBe("parked");
      expect(report.overallScore).toBe(0);
      expect(report.techStack[0]).toContain("Parked Domain");
      expect(report.findings.length).toBe(3);
      expect(report.findings[0].title).toContain("parking page");

      // Track 2 specialized cold email
      expect(report.generatedEmail.subject).toBe("Quick question about Maple Table's website");
      expect(report.generatedEmail.bodyText).toContain("appears to be parked / not currently active");
      expect(report.generatedEmail.bodyText).toContain("standout 4.6-star customer rating");
      expect(report.generatedEmail.bodyText).toContain("assume the business may be closed");
      expect(report.generatedEmail.bodyHtml).toContain("Assumed Closure");
      expect(report.generatedEmail.bodyText).toContain("Mohammad Jafar");
    });
  });
});

