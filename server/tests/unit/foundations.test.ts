import { describe, it, expect, vi, afterEach } from "vitest";
import { searchPlaces } from "../../src/lib/places.js";
import { env } from "../../src/config/env.js";

afterEach(() => vi.unstubAllGlobals());
describe("discovery truthfulness", () => {
  const query = { region: { type: "city" as const, query: "London" }, categories: ["cafes"] };
  it("does not fabricate businesses when no paid source is configured", async () => {
    env.GOOGLE_MAPS_SERVER_API_KEY = "";
    env.GOOGLE_PLACES_STAGING = false;
    await expect(searchPlaces(query)).rejects.toThrow();
  });
  it("preserves an empty upstream result", async () => {
    env.GOOGLE_MAPS_SERVER_API_KEY = "test-only";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ places: [] }))));
    expect((await searchPlaces(query)).places).toEqual([]);
  });
  it("reports upstream failure instead of generating leads", async () => {
    env.GOOGLE_MAPS_SERVER_API_KEY = "test-only";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503 })));
    await expect(searchPlaces(query)).rejects.toThrow();
  });
});
