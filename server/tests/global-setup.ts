import { validateTestDatabaseTarget } from "./helpers/test-database-target.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runner } from "node-pg-migrate";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  const testUrl = validateTestDatabaseTarget(process.env.TEST_DATABASE_URL);
  const adminUrl = new URL(testUrl); adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  // Deterministic per-run state: drop and recreate the test database so a
  // corrupted/partial prior run can never leak into the next one.
  await admin.query("drop database if exists leadflow_test with (force)");
  await admin.query("create database leadflow_test");
  await admin.end();


  process.env.DATABASE_URL_TEST = testUrl.toString();

  const applied = await runner({
    databaseUrl: testUrl.toString(),
    dir: path.resolve(__dirname, "../migrations"),
    migrationsTable: "pgmigrations",
    direction: "up",
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  });
  console.log(`[test-setup] migrations: ${applied.length} applied to leadflow_test`);
}