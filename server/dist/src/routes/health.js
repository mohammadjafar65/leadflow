import { Router } from "express";
import { pool } from "../db/pool.js";
import { redis } from "../db/redis.js";
export const healthRouter = Router();
healthRouter.get("/health", async (_req, res) => {
    let db = "up";
    try {
        await pool.query("select 1");
    }
    catch {
        db = "down";
    }
    let cache = 'up';
    try {
        await redis.ping();
    }
    catch {
        cache = 'down';
    }
    const healthy = db === 'up' && cache === 'up';
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'unavailable', db, redis: cache });
});
//# sourceMappingURL=health.js.map