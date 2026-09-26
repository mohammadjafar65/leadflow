import { apiClient } from "@/lib/api-client";
import type { Campaign, CampaignLead, CreateCampaignPayload } from "@/types/campaign";

export const campaignsApi = {
  list: () => apiClient.get<{ campaigns: Campaign[] }>("/campaigns"),

  get: (id: string) =>
    apiClient.get<{ campaign: Campaign; leads: CampaignLead[] }>(`/campaigns/${id}`),

  create: (data: CreateCampaignPayload) =>
    apiClient.post<{ campaign: Campaign; enrolledCount: number; skippedCount: number }>(
      "/campaigns",
      data,
    ),

  launch: (id: string) =>
    apiClient.post<{ success: boolean; queuedCount: number }>(`/campaigns/${id}/launch`, {}),

  pause: (id: string) =>
    apiClient.post<{ success: boolean; status: string }>(`/campaigns/${id}/pause`, {}),

  resume: (id: string) =>
    apiClient.post<{ success: boolean; status: string }>(`/campaigns/${id}/resume`, {}),

  delete: (id: string) => apiClient.delete<void>(`/campaigns/${id}`),

  retry: (id: string) =>
    apiClient.post<{ success: boolean; retriedCount: number }>(`/campaigns/${id}/retry`, {}),

  testSend: (data: {
    senderIdentityId: string;
    recipientEmail: string;
    subject: string;
    bodyHtml: string;
  }) =>
    apiClient.post<{ success: boolean; messageId?: string; simulated?: boolean }>(
      "/campaigns/test-send",
      data,
    ),
};
