import { apiClient } from "@/lib/api-client";
import type { Lead, LeadSearchParams, PipelineStage, AuditReport } from "@/types/lead";

export const leadsApi = {
  list: (params: { cursor?: string; limit?: number; stage?: PipelineStage; category?: string; q?: string; scoreMin?:number; scoreMax?:number; tag?:string }) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
    );
    return apiClient.get<{ items: Lead[]; nextCursor: string | null }>(`/leads?${qs}`);
  },

  get: (id: string) => apiClient.get<Lead>(`/leads/${id}`),

  updateStage: (id: string, stage: PipelineStage) =>
    apiClient.patch<Lead>(`/leads/${id}`, { stage }),

  /** Kicks off a background extraction job; returns a jobId to subscribe to over WS. */
  startExtraction: (params: LeadSearchParams, idempotencyKey: string) =>
    apiClient.post<{ jobId: string }>("/leads/extract", params, idempotencyKey),

  merge: (primaryId: string, duplicateId: string) =>
    apiClient.post<Lead>(`/leads/${primaryId}/merge`, { duplicateId }),

  export: (fields: string[], filters: Record<string, unknown>, format: "csv" | "xlsx" | "json") =>
    apiClient.post<{ downloadUrl: string }>("/leads/export", { fields, filters, format }),

  getAudit: (leadId: string) =>
    apiClient.get<{ audit: AuditReport | null }>(`/leads/${leadId}/audit`),

  runAudit: (leadId: string) =>
    apiClient.post<{ audit: AuditReport }>(`/leads/${leadId}/audit`, {}),

  delete: (id: string) => apiClient.delete<void>(`/leads/${id}`),
  batchDelete: (ids: string[]) =>
    apiClient.post<{ deletedCount: number }>("/leads/batch-delete", { ids }),
  batchUpdateStage: (ids: string[], stage: PipelineStage) =>
    apiClient.post<{ updatedCount: number }>("/leads/batch-stage", { ids, stage }),
};

