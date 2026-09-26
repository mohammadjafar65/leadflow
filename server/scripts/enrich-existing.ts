import { pool } from "../src/db/pool.js";
import { enrichLead } from "../src/worker/enrich-worker.js";

async function main() {
  const { rows } = await pool.query("select id, name, website from leads where website is not null");
  console.log(`Found ${rows.length} leads to enrich...`);

  for (const row of rows) {
    const result = await enrichLead(row.id);
    console.log(`Enriched [${row.name}]: email=${result.email ?? "none"}, score=${result.score}`);
  }

  console.log("All leads successfully enriched!");
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
