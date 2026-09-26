import { pool } from "../db/pool.js";
import { currentAuth } from "./auth.js";
/**
 * Honours the `Idempotency-Key` header on mutating requests: a retried POST
 * with the same key replays the stored response for up to 24h instead of
 * double-applying the side effect (architecture.md §3). Scoped per user+key.
 */
export async function idempotent(req, res, next) {
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length > 128) {
        next();
        return;
    }
    const auth = currentAuth(res);
    const path = `${req.method} ${req.baseUrl}${req.path}`;
    const existing = await pool.query(`select status_code, response from idempotency_keys
     where user_id = $1 and key = $2 and created_at > now() - interval '24 hours'`, [auth.sub, key]);
    if (existing.rows[0]) {
        res.status(existing.rows[0].status_code).json(existing.rows[0].response);
        return;
    }
    // Capture the real response, then store it.
    const originalJson = res.json.bind(res);
    res.json = ((body) => {
        void pool.query(`insert into idempotency_keys (organization_id, user_id, key, method, path, status_code, response)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id, key) do update
         set status_code = excluded.status_code, response = excluded.response`, [auth.org, auth.sub, key, req.method, path, res.statusCode, body]);
        return originalJson(body);
    });
    next();
}
//# sourceMappingURL=idempotency.js.map