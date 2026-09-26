export type JobKind = "scrape" | "enrich" | "send" | "sequence-tick";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";