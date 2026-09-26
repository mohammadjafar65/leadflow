export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "cancelled";

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  senderIdentityId: string;
  senderDisplayName?: string;
  senderEmail?: string;
  templateId?: string | null;
  templateName?: string | null;
  subject: string;
  bodyHtml: string;
  delaySeconds: number;
  totalLeads: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface CampaignLead {
  id: string;
  leadId: string;
  companyName: string;
  recipientEmail: string;
  website?: string | null;
  stage: string;
  status: "pending" | "queued" | "sending" | "sent" | "failed" | "skipped";
  scheduledAt?: string | null;
  sentAt?: string | null;
  errorMessage?: string | null;
  retryCount: number;
}

export interface CreateCampaignPayload {
  name: string;
  senderIdentityId: string;
  templateId?: string;
  subject: string;
  bodyHtml: string;
  delaySeconds: number;
  leadIds: string[];
  autoLaunch?: boolean;
}
