import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runner } from "node-pg-migrate";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from cwd or relative paths
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const args = process.argv.slice(2);
const direction = args.includes("down") ? "down" : "up";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (copy server/.env.example to server/.env)");
  process.exit(1);
}

let clientToClose = null;
const runnerOptions = {
  dir: path.resolve(__dirname, "../migrations"),
  direction,
  migrationsTable: "pgmigrations",
  logger: {
    info: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
    debug: () => {},
  },
};

if (process.env.DATABASE_URL.includes("neon.tech")) {
  const { Client, neonConfig } = await import("@neondatabase/serverless");
  const ws = (await import("ws")).default;
  neonConfig.webSocketConstructor = ws;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  clientToClose = client;
  runnerOptions.dbClient = client;
  console.log("[migrate] Connected to Neon database over secure WebSocket (port 443).");
} else {
  runnerOptions.databaseUrl = process.env.DATABASE_URL;
}

let result;
try {
  result = await runner(runnerOptions);
} finally {
  if (clientToClose) {
    await clientToClose.end();
  }
}

if (direction === "up" && result.length > 0) {
  console.log(`Applied ${result.length} migration(s):`);
  for (const m of result) console.log(`  - ${m.name}`);
} else if (direction === "down" && result.length > 0) {
  console.log(`Reverted ${result.length} migration(s).`);
} else {
  console.log("Database already up to date.");
}