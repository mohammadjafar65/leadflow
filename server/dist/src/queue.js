import { Queue } from "bullmq";
import { queueConnection } from "./db/redis.js";
/** Separate queues per job type so a slow queue never starves another. */
export const scrapeQueue = new Queue("scrape", { connection: queueConnection });
export const enrichQueue = new Queue("enrich", { connection: queueConnection });
export const sendQueue = new Queue("send", { connection: queueConnection });
export const sequenceTickQueue = new Queue("sequence-tick", { connection: queueConnection });
export const igDmQueue = new Queue("ig-dm", { connection: queueConnection });
//# sourceMappingURL=queue.js.map