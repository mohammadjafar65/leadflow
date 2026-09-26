export interface SenderIdentity {
  id: string;
  displayName: string;
  emailAddress: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername?: string;
  dailySendCap: number;
  domainAgeDays?: number;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  variantGroup?: string;
}

export type SequenceStepKind = "delay" | "condition" | "send_email" | "branch";

export interface SequenceStep {
  id: string;
  order: number;
  kind: SequenceStepKind;
  config: Record<string, unknown>;
}

export interface Sequence {
  id: string;
  name: string;
  industryVertical?: string;
  isTemplate: boolean;
  steps: SequenceStep[];
}

export type EmailEventType = "sent" | "opened" | "clicked" | "replied" | "bounced" | "complained";

export interface EmailEvent {
  id: string;
  leadId: string;
  type: EmailEventType;
  createdAt: string;
}
