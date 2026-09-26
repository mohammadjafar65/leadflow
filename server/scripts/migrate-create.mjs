import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error("Usage: npm run migrate:create -- <migration_name>");
  process.exit(1);
}
const stamp = Date.now(); // node-pg-migrate expects epoch-millisecond prefixes
const file = path.resolve(__dirname, `../migrations/${stamp}_${name}.sql`);
fs.writeFileSync(file, "-- up\n\n-- down\n");
console.log(`Created ${file}`);