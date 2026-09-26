import { startSequenceScheduler, stopSequenceScheduler } from "./worker/sequence-worker.js";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { redis, sub } from "./db/redis.js";
import { attachJobSocketServer } from "./ws/index.js";
import { startScrapeWorker } from "./worker/scrape-worker.js";
import { startEnrichWorker } from "./worker/enrich-worker.js";
import { startSendWorker } from "./worker/send-worker.js";
import { startIgDmWorker } from "./worker/ig-dm-worker.js";
import { startIgCommentPoller, stopIgCommentPoller } from "./worker/ig-poller.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`[leadflow-api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Live job-progress channel (/ws/jobs/:jobId) on the same HTTP server.
attachJobSocketServer(server);

// Start background workers so queued jobs (scrapes, enrichment, sends, Instagram DMs) process automatically
const workers = env.RUN_WORKERS ? [
  startScrapeWorker(),
  startEnrichWorker(),
  startSendWorker(),
  startIgDmWorker(),
] : [];
if(env.RUN_WORKERS) startIgCommentPoller();
if(env.RUN_WORKERS) startSequenceScheduler();
console.log(`[leadflow-api] background workers started:`, workers.map((w) => w.name).join(", "));

async function shutdown(signal: string) {
  stopIgCommentPoller(); stopSequenceScheduler();
  console.log(`[leadflow-api] ${signal} received, shutting down`);
  server.close(async () => {
    await Promise.allSettled(workers.map((w) => w.close()));
    await Promise.allSettled([pool.end(), redis.quit(), sub.quit()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));