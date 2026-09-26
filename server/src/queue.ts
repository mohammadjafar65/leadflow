import { Queue } from "bullmq";
import { queueConnection } from "./db/redis.js";

/** Separate queues per job type so a slow queue never starves another. */
export const scrapeQueue = new Queue("scrape", { connection: queueConnection });
export const enrichQueue = new Queue("enrich", { connection: queueConnection });
export const sendQueue = new Queue("send", { connection: queueConnection });
export const sequenceTickQueue = new Queue("sequence-tick", { connection: queueConnection });
export const igDmQueue = new Queue("ig-dm", { connection: queueConnection });


export interface ScrapeJobData {
  jobId: string;
  orgId: string;
  userId: string;
  params: {
    source?: "openstreetmap" | "google_maps" | "google_places_api" | "yelp" | "yellowpages";
    region: { type: "city" | "radius"; query?: string; center?: { lat: number; lng: number }; radiusMeters?: number };
    categories: string[];
    limit?: number;
  };
}