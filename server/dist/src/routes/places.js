import { Router } from "express";
import { z } from "zod";
import { redis } from "../db/redis.js";
import { ApiError, asyncHandler } from "../lib/http.js";
import { currentAuth, requireAuth } from "../middleware/auth.js";
import { consumeToken } from "../lib/rate-limit.js";
import { searchOpenData, discoveryStatus } from "../lib/discovery/service.js";
import { OSM_CATEGORIES } from "../lib/discovery/osm.js";
import { CATEGORIES } from "../lib/categories.js";
import { env } from "../config/env.js";
export const placesRouter = Router();
placesRouter.use(requireAuth);
const CATEGORIES_CACHE_KEY = "lf:taxonomy:open:v2";
const CATEGORIES_TTL_SECONDS = 24 * 60 * 60; // architecture.md §4
placesRouter.get("/places/status", asyncHandler(async (_req, res) => {
    res.json(discoveryStatus());
}));
placesRouter.get("/places/categories", asyncHandler(async (_req, res) => {
    try {
        const cached = await redis.get(CATEGORIES_CACHE_KEY);
        if (cached) {
            res.setHeader("Cache-Control", "public, max-age=3600");
            res.json(JSON.parse(cached));
            return;
        }
    }
    catch {
        // Ignore cache read failures
    }
    const payload = { categories: CATEGORIES.filter(c => OSM_CATEGORIES[c.id]) };
    try {
        await redis.set(CATEGORIES_CACHE_KEY, JSON.stringify(payload), "EX", CATEGORIES_TTL_SECONDS);
    }
    catch {
        // Ignore cache write failures (e.g. read-only token)
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(payload);
}));
const searchSchema = z.object({
    region: z.discriminatedUnion("type", [
        z.object({ type: z.literal("city"), query: z.string().min(1).max(120) }),
        z.object({
            type: z.literal("radius"),
            center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
            radiusMeters: z.number().int().min(100).max(50000).default(5000),
        }),
    ]),
    categories: z.array(z.string().min(1)).min(1).max(10),
    pageToken: z.string().max(500).optional(),
    limit: z.number().int().min(1).max(20).optional(),
});
const MONTHLY_KEY = (orgId, month) => `lf:places:monthly:${orgId}:${month}`;
/** Per-org monthly search-credit cap (roadmap risk table: quota/cost blowup). */
async function consumeMonthlyCredit(orgId) {
    const month = new Date().toISOString().slice(0, 7);
    const key = MONTHLY_KEY(orgId, month);
    const count = await redis.incr(key);
    if (count === 1)
        await redis.expire(key, 32 * 24 * 60 * 60);
    if (count > env.PLACES_MONTHLY_CAP) {
        throw new ApiError(429, `Monthly Places search cap of ${env.PLACES_MONTHLY_CAP} reached for this workspace`);
    }
}
placesRouter.post("/places/search", asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = searchSchema.parse(req.body);
    // FR-1.4: server-side per-org QPS cap (Google quota lives server-side only).
    const rl = await consumeToken(redis, `lf:places:rl:${auth.org}`, env.PLACES_QPS_PER_ORG);
    if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.retryAfterSeconds));
        throw new ApiError(429, `Places rate limit exceeded — retry in ${rl.retryAfterSeconds}s`);
    }
    await consumeMonthlyCredit(auth.org);
    const region = body.region.type === "radius"
        ? { type: "radius", center: body.region.center, radiusMeters: body.region.radiusMeters }
        : { type: "city", query: body.region.query };
    const result = await searchOpenData({
        region,
        categories: body.categories,
        pageToken: body.pageToken,
        limit: body.limit,
    });
    res.json(result);
}));
/** Shared by the scrape worker so background extraction honors the same caps. */
export async function consumePlacesBudget(orgId) {
    try {
        await Promise.race([
            (async () => {
                const rl = await consumeToken(redis, `lf:places:rl:${orgId}`, env.PLACES_QPS_PER_ORG);
                if (!rl.allowed) {
                    throw new ApiError(429, `Places rate limit exceeded — retry in ${rl.retryAfterSeconds}s`);
                }
                await consumeMonthlyCredit(orgId);
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Redis timeout")), 2000)),
        ]);
    }
    catch (err) {
        if (err instanceof ApiError)
            throw err;
        console.warn("[places] rate-limiting check bypassed due to Redis error or timeout:", err instanceof Error ? err.message : err);
    }
}
//# sourceMappingURL=places.js.map