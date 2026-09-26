import { apiClient } from "@/lib/api-client";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  kind: string;
  status: JobStatus;
  progress: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const jobsApi = {
  get: (id: string) => apiClient.get<{ job: Job }>(`/jobs/${id}`),
  list: () => apiClient.get<{ jobs: Job[] }>("/jobs"),
};
