import { describe, expect, it } from "vitest";
import {
  findDedupMatch,
  normalizeDomain,
  normalizePhone,
  planMerge,
  trigramSimilarity,
  distanceMeters,
  type DedupCandidate,
} from "../src/lib/dedup.js";

const candidate = (over: Partial<DedupCandidate> = {}): DedupCandidate => ({
  id: "c1",
  name: "Acme Design Studio",
  phoneE164: "+14155552671",
  domain: "acmedesign.com",
  lat: 37.7749,
  lng: -122.4194,
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

describe("normalizePhone", () => {
  it("normalizes US numbers to E.164", () => {
    expect(normalizePhone("(415) 555-2671")).toBe("+14155552671");
    expect(normalizePhone("+1 415-555-2671")).toBe("+14155552671");
  });
  it("keeps international numbers as-is", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("returns null for garbage", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("n/a")).toBeNull();
  });
});

describe("normalizeDomain", () => {
  it("strips scheme, www, and trailing paths", () => {
    expect(normalizeDomain("https://www.AcmeDesign.com/contact")).toBe("acmedesign.com");
    expect(normalizeDomain("http://acmedesign.com")).toBe("acmedesign.com");
  });
  it("rejects non-URLs", () => {
    expect(normalizeDomain("not a url")).toBeNull();
  });
});

describe("trigramSimilarity", () => {
  it("is 1.0 for identical strings", () => {
    expect(trigramSimilarity("Acme Design", "acme design")).toBe(1);
  });
  it("ranks near-matches above 0.9 and distant ones below", () => {
    const near = trigramSimilarity("Joe's Pizza", "Joes Pizza");
    const far = trigramSimilarity("Joe's Pizza", "Golden Dragon Noodle House");
    expect(near).toBeGreaterThanOrEqual(0.9);
    expect(far).toBeLessThan(0.9);
  });
  it("handles short names without crashing", () => {
    expect(trigramSimilarity("AB", "AC")).toBeLessThan(1);
  });
});

describe("distanceMeters", () => {
  it("returns ~0 for the same point", () => {
    expect(distanceMeters(37.7749, -122.4194, 37.7749, -122.4194)).toBeLessThan(1);
  });
  it("returns roughly 100m for 0.001 degrees of latitude", () => {
    const d = distanceMeters(37.7749, -122.4194, 37.7758, -122.4194);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(120);
  });
});

describe("findDedupMatch", () => {
  it("matches on phone even when everything else differs", () => {
    const m = findDedupMatch(
      { name: "Totally Different Name", phoneE164: "(415) 555-2671", domain: "other.com", lat: 0, lng: 0 },
      [candidate()],
    );
    expect(m).toEqual({ candidateId: "c1", reason: "phone" });
  });

  it("matches on domain even when phone differs", () => {
    const m = findDedupMatch(
      { name: "Renamed Biz", phoneE164: "+19999999999", domain: "https://www.acmedesign.com/contact" },
      [candidate()],
    );
    expect(m).toEqual({ candidateId: "c1", reason: "domain" });
  });

  it("matches on name similarity + proximity when phone/domain are missing", () => {
    const m = findDedupMatch(
      { name: "Acme Design Studio LLC", lat: 37.7748, lng: -122.4195 },
      [candidate({ phoneE164: null, domain: null })],
    );
    expect(m?.reason).toBe("name_proximity");
    expect(m?.nameSimilarity).toBeGreaterThanOrEqual(0.9);
    expect(m?.distanceMeters).toBeLessThanOrEqual(100);
  });

  it("does NOT match on similar names beyond 100m", () => {
    const m = findDedupMatch(
      { name: "Acme Design Studio LLC", lat: 38.0, lng: -122.4195 },
      [candidate({ phoneE164: null, domain: null })],
    );
    expect(m).toBeNull();
  });

  it("returns null when no signal matches", () => {
    const m = findDedupMatch(
      { name: "Completely Unrelated", phoneE164: "+12125550000", domain: "elsewhere.net" },
      [candidate()],
    );
    expect(m).toBeNull();
  });

  it("prefers phone over weaker signals", () => {
    const sameNameNearby = candidate({ phoneE164: null, id: "c2", name: "Acme Design Studio" });
    const m = findDedupMatch(
      { name: "Acme Design Studio", phoneE164: "(415) 555-2671" },
      [sameNameNearby, candidate()],
    );
    expect(m?.candidateId).toBe("c1");
    expect(m?.reason).toBe("phone");
  });
});

describe("planMerge", () => {
  const older = "2026-01-01T00:00:00Z";
  const newer = "2026-02-01T00:00:00Z";

  it("keeps the non-empty field", () => {
    const plan = planMerge(
      { name: "Acme", website: "", phoneE164: null, address: "1 Main St" },
      { name: "", website: "https://acme.com", phoneE164: "+14155552671", address: "2 Main St" },
      older,
      newer,
    );
    expect(plan.website).toBe("https://acme.com");
    expect(plan.phoneE164).toBe("+14155552671");
  });

  it("recency wins when both are populated", () => {
    const plan = planMerge({ name: "Old Name" }, { name: "New Name" }, older, newer);
    expect(plan.name).toBe("New Name");
  });

  it("primary wins when duplicate is empty", () => {
    const plan = planMerge({ category: "restaurant" }, { category: "" }, newer, older);
    expect(plan.category).toBe("restaurant");
  });
});