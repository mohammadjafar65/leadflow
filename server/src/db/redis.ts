import { Redis } from "ioredis";
import { env } from "../config/env.js";

/** General-purpose: cache + rate limiting. */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  connectTimeout: 5000,
  enableReadyCheck: false,
});
redis.on("error", (err) => console.error("[redis] error:", err.message));

/** BullMQ-compatible connection (workers require maxRetriesPerRequest: null). */
export const queueConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  connectTimeout: 5000,
  enableReadyCheck: false,
});
queueConnection.on("error", (err) => console.error("[redis-queue] error:", err.message));

/** Publisher for WebSocket job-progress events (workers publish here). */
export const pub = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  connectTimeout: 5000,
  enableReadyCheck: false,
});
pub.on("error", (err) => console.error("[redis-pub] error:", err.message));

/** Subscriber for the WS gateway (single subscriber connection). */
export const sub = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  connectTimeout: 5000,
  enableReadyCheck: false,
});
sub.on("error", (err) => console.error("[redis-sub] error:", err.message));

export function jobChannel(jobId: string): string {
  return `job:${jobId}`;
}

export async function publishJobEvent(jobId: string, event: Record<string, unknown>) {
  try {
    await pub.publish(jobChannel(jobId), JSON.stringify(event));
  } catch (err) {
    console.warn(`[redis] publishJobEvent failed for job ${jobId}:`, (err as Error).message);
  }
}