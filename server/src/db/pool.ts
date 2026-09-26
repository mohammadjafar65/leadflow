import pg from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { env } from "../config/env.js";

const isNeon = env.DATABASE_URL.includes("neon.tech");

if (isNeon) {
  neonConfig.webSocketConstructor = ws;
}

export const pool: pg.Pool = isNeon
  ? (new NeonPool({
      connectionString: env.DATABASE_URL,
      max: 25,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    }) as unknown as pg.Pool)
  : new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: 25,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });

pool.on("error", (err) => {
  console.error("[pg pool error]", err.message || err);
});

export type Db = pg.Pool;
export type Queryable = pg.Pool | pg.PoolClient;