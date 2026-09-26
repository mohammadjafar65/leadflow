import { startSequenceScheduler, stopSequenceScheduler } from "./sequence-worker.js";
import { startScrapeWorker } from "./scrape-worker.js";
import { startEnrichWorker } from "./enrich-worker.js";
import { startSendWorker } from "./send-worker.js";
import { startIgDmWorker } from "./ig-dm-worker.js";
import { startIgCommentPoller, stopIgCommentPoller } from "./ig-poller.js";
import { queueConnection } from "../db/redis.js";

const workers = [startScrapeWorker(), startEnrichWorker(), startSendWorker(), startIgDmWorker()];
startIgCommentPoller();
startSequenceScheduler();

console.log("[leadflow-worker] started:", workers.map((w) => w.name).join(", "));


async function shutdown(signal: string) {
  stopIgCommentPoller(); stopSequenceScheduler();
  console.log(`[leadflow-worker] ${signal} received, closing workers`);
  await Promise.all(workers.map((w) => w.close()));
  await queueConnection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));