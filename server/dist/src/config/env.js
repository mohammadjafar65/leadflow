import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from cwd or project root if not already provided in environment
if (process.env.VITEST !== "true") {
    dotenv.config({ path: path.resolve(process.cwd(), ".env") });
    dotenv.config({ path: path.resolve(__dirname, "../../.env") });
    dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}
const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.union([z.coerce.number().int().positive(), z.string().min(1)]).default(4000),
    DATABASE_URL: z.string().min(1).transform((val) => {
        try {
            const parsed = new URL(val);
            if (parsed.hostname.endsWith(".neon.tech")) {
                if (!parsed.port || parsed.port === "5432") {
                    parsed.port = "443";
                }
                if (!parsed.searchParams.has("uselibpqcompat")) {
                    parsed.searchParams.set("uselibpqcompat", "true");
                }
                return parsed.toString();
            }
        }
        catch {
            // fallback
        }
        return val;
    }),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
    // Auth (architecture.md §6)
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
    // Secrets at rest (AES-256-GCM requires a 32-byte key). Dev default only —
    // production must source this from KMS, not a checked-in value.
    ENCRYPTION_KEY: z.string().min(32).default("leadflow-dev-only-encryption-key-0001"),
    OPEN_DATA_FILE: z.string().default(""),
    OVERPASS_URL: z.string().default(""),
    GEOCODER_URL: z.string().default(""),
    OPEN_DATA_DAILY_QUERIES: z.coerce.number().int().min(1).max(1000).default(100),
    RUN_WORKERS: z.string().default("false").transform(v => v === "true"),
    // Google Places (legacy)
    GOOGLE_MAPS_SERVER_API_KEY: z.string().optional().default(""),
    GOOGLE_PLACES_STAGING: z
        .string()
        .optional()
        .transform((v) => v === "true"),
    PLACES_QPS_PER_ORG: z.coerce.number().default(10),
    /** hard per-org monthly search-credit cap (roadmap risk table) */
    PLACES_MONTHLY_CAP: z.coerce.number().default(5000),
    // Crawling (Phase 2)
    DEFAULT_CRAWL_DELAY_MS: z.coerce.number().default(3000),
    DEFAULT_CRAWL_CONCURRENCY_PER_DOMAIN: z.coerce.number().default(1),
    // Meta / Instagram Auto DM
    META_APP_ID: z.string().default(""),
    META_APP_SECRET: z.string().default(""),
    /** Random string used to verify Meta webhook handshake */
    META_WEBHOOK_VERIFY_TOKEN: z.string().default(""),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
        console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
}
if (parsed.data.NODE_ENV === 'production' && (parsed.data.ENCRYPTION_KEY === 'leadflow-dev-only-encryption-key-0001' || parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET)) {
    console.error('Production requires a private encryption key and distinct JWT signing secrets.');
    process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
//# sourceMappingURL=env.js.map