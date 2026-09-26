import pg from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { env } from "../config/env.js";
const isNeon = env.DATABASE_URL.includes("neon.tech");
if (isNeon) {
    neonConfig.webSocketConstructor = ws;
}
export const pool = isNeon
    ? new NeonPool({
        connectionString: env.DATABASE_URL,
        max: 25,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
    })
    : new pg.Pool({
        connectionString: env.DATABASE_URL,
        max: 25,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
    });
pool.on("error", (err) => {
    console.error("[pg pool error]", err.message || err);
});
//# sourceMappingURL=pool.js.map