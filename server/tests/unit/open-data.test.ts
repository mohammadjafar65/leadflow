import { expect, it } from "vitest";
import { normalizeOsm, buildOverpassQuery } from "../../src/lib/discovery/osm.js";
import { isPublicAddress } from "../../src/lib/safe-fetch.js";
it("retains observed source identity and never invents missing contact fields", () => {
  const p = normalizeOsm({ type: "node", id: 123, lat: 0, lon: 0, tags: { name: "Actual cafe", amenity: "cafe" } });
  expect(p).toMatchObject({ id: "node/123", name: "Actual cafe", lat: 0, lng: 0, sourceUrl: "https://www.openstreetmap.org/node/123" });
  expect(p?.phone).toBeUndefined(); expect(p?.website).toBeUndefined();
  expect(normalizeOsm({ type: "node", id: 4, tags: {} })).toBeNull();
});
it("builds bounded category queries and rejects unknown categories", () => {
  expect(buildOverpassQuery(["cafes"], { lat: 51.5, lng: -0.1 }, 1000)).toContain('["amenity"="cafe"]');
  expect(() => buildOverpassQuery(['"];out;'], { lat: 0, lng: 0 }, 1000)).toThrow();
  expect(() => buildOverpassQuery(["cafes"], { lat: 100, lng: 0 }, 1000)).toThrow();
});
it("rejects non-public network destinations including mapped IPv6", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "0.0.0.0"]) expect(isPublicAddress(ip), ip).toBe(false);
  expect(isPublicAddress("8.8.8.8")).toBe(true);
  expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
});
