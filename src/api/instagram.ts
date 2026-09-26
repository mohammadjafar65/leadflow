import { apiClient } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TriggerType = "comment_to_dm" | "story_reply" | "keyword_dm" | "new_follower";
export type AutomationStatus = "queued" | "sent" | "failed" | "skipped" | "unknown";

export interface IgAccount {
  id: string;
  igUserId: string;
  username: string;
  tokenExpiresAt: string | null;
  createdAt: string;
}

export interface IgMediaItem {
  id: string;
  caption?: string;
  mediaType: string;
  mediaProductType?: string;
  permalink?: string;
  thumbnailUrl?: string;
  timestamp?: string;
}

export interface IgAutomation {
  id: string;
  instagramAccountId: string;
  accountUsername?: string;
  name: string;
  triggerType: TriggerType;
  keywords: string[];
  messageTemplate: string;
  linkUrl: string | null;
  buttonLabel?: string | null;
  commentReplyTemplate?: string | null;
  targetMediaId?: string | null;
  targetMediaUrl?: string | null;
  targetMediaCaption?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IgAutomationEvent {
  id: string;
  triggerType: string;
  triggerSourceId: string | null;
  recipientIgId: string;
  recipientUsername: string | null;
  status: AutomationStatus | "ignored" | "processing";
  errorMessage: string | null;
  queuedAt: string;
  sentAt: string | null;
  createdAt: string;
  commentText?: string | null;
  mediaId?: string | null;
  mediaUrl?: string | null;
  actionTaken?: string | null;
}

export interface IgCommentItem {
  id: string;
  text: string;
  timestamp: string;
  from?: {
    id: string;
    username: string;
  };
  likeCount?: number;
  isReply?: boolean;
  parentId?: string;
  isSelfComment: boolean;
  matchesKeyword: boolean;
  matchedKeyword: string | null;
  status: string;
  actionTaken: string | null;
  sentAt: string | null;
}

export interface CommentsResponse {
  targetMediaId: string | null;
  targetMediaUrl: string | null;
  comments: IgCommentItem[];
  totalCount: number;
}

export interface SyncCommentsResponse {
  success: boolean;
  syncedCount: number;
  repliedCount: number;
  queuedCount: number;
  errors: Array<{ commentId: string; error: string }>;
}

export interface CreateAutomationPayload {
  instagramAccountId: string;
  name: string;
  triggerType: TriggerType;
  keywords: string[];
  messageTemplate: string;
  linkUrl?: string;
  buttonLabel?: string;
  commentReplyTemplate?: string;
  targetMediaId?: string | null;
  targetMediaUrl?: string | null;
  targetMediaCaption?: string | null;
}

export interface UpdateAutomationPayload {
  name?: string;
  triggerType?: TriggerType;
  keywords?: string[];
  messageTemplate?: string;
  linkUrl?: string;
  buttonLabel?: string;
  commentReplyTemplate?: string;
  targetMediaId?: string | null;
  targetMediaUrl?: string | null;
  targetMediaCaption?: string | null;
  isActive?: boolean;
}



// ─── API Client ──────────────────────────────────────────────────────────────

export const instagramApi = {
  /** Get the Meta OAuth URL to redirect the user to */
  getOAuthUrl: () =>
    apiClient.get<{ url: string; state: string }>("/instagram/oauth-url"),

  /** Exchange the OAuth code for a token and save the account */
  connectAccount: (code: string, state: string) =>
    apiClient.post<{ account: IgAccount }>("/instagram/oauth-callback", { code, state }),

  /** Connect directly with an access token (e.g. from Meta Dashboard Step 2) */
  connectWithToken: (accessToken: string) =>
    apiClient.post<{ account: IgAccount }>("/instagram/connect-token", { accessToken }),

  /** List connected Instagram accounts */
  listAccounts: () =>
    apiClient.get<{ accounts: IgAccount[] }>("/instagram/accounts"),

  /** Disconnect an Instagram account */
  disconnectAccount: (id: string) =>
    apiClient.delete<void>(`/instagram/accounts/${id}`),

  /** Get recent media (Reels and Posts) published by an account */
  getMedia: (accountId: string) =>
    apiClient.get<{ media: IgMediaItem[] }>(`/instagram/media?accountId=${accountId}`),

  /** Resolve Instagram Reel/Post by URL */
  resolveReel: (accountId: string, url: string) =>
    apiClient.get<{ media: IgMediaItem | null }>(
      `/instagram/resolve-reel?accountId=${accountId}&url=${encodeURIComponent(url)}`,
    ),

  /** List all automations */
  listAutomations: () =>
    apiClient.get<{ automations: IgAutomation[] }>("/instagram/automations"),

  /** Create a new automation */
  createAutomation: (data: CreateAutomationPayload) =>
    apiClient.post<{ automation: IgAutomation }>("/instagram/automations", data),

  /** Update an automation (including toggling isActive) */
  updateAutomation: (id: string, data: UpdateAutomationPayload) =>
    apiClient.patch<{ automation: IgAutomation }>(`/instagram/automations/${id}`, data),

  /** Delete an automation */
  deleteAutomation: (id: string) =>
    apiClient.delete<void>(`/instagram/automations/${id}`),

  /** Get paginated event log for an automation */
  listEvents: (automationId: string, limit = 1000, offset = 0) =>
    apiClient.get<{ events: IgAutomationEvent[] }>(
      `/instagram/automations/${automationId}/events?limit=${limit}&offset=${offset}`,
    ),

  /** Get live comments for an automation's target Reel/Post */
  getComments: (automationId: string) =>
    apiClient.get<CommentsResponse>(`/instagram/automations/${automationId}/comments`),

  /** Sync comments from Instagram and process matching ones */
  syncComments: (automationId: string) =>
    apiClient.post<SyncCommentsResponse>(`/instagram/automations/${automationId}/sync-comments`),

  /** Manually trigger DM & comment reply for a specific comment */
  triggerCommentDm: (
    automationId: string,
    data: { commentId: string; senderId?: string; senderUsername?: string; commentText?: string },
  ) =>
    apiClient.post<{ success: boolean; messageId?: string }>(
      `/instagram/automations/${automationId}/trigger-comment`,
      data,
    ),
};
