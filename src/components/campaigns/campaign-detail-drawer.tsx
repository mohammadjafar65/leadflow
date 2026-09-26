import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { campaignsApi } from "@/api/campaigns";
import type { CampaignStatus } from "@/types/campaign";

interface CampaignDetailDrawerProps {
  campaignId: string;
  onClose: () => void;
}

const STATUS_BADGES: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  scheduled: { label: "Scheduled", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  running: { label: "Running", className: "bg-green-500/10 text-green-600 border-green-500/20 animate-pulse" },
  paused: { label: "Paused", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  completed: { label: "Completed", className: "bg-green-600/15 text-green-700 border-green-600/30" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function CampaignDetailDrawer({ campaignId, onClose }: CampaignDetailDrawerProps) {
  const qc = useQueryClient();
  const [testEmail, setTestEmail] = useState("");
  const [showTestForm, setShowTestForm] = useState(false);

  // Fetch campaign details with auto-refetch if running
  const { data, isLoading } = useQuery({
    queryKey: ["campaigns", campaignId],
    queryFn: () => campaignsApi.get(campaignId),
    refetchInterval: (query) => {
      const status = query.state.data?.campaign?.status;
      return status === "running" ? 3000 : false;
    },
  });

  const campaign = data?.campaign;
  const leads = data?.leads ?? [];

  // Mutations
  const launchMutation = useMutation({
    mutationFn: () => campaignsApi.launch(campaignId),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(`Campaign launched! Queued ${res.queuedCount} emails with automated delay.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pauseMutation = useMutation({
    mutationFn: () => campaignsApi.pause(campaignId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.info("Campaign paused. In-flight jobs will postpone.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resumeMutation = useMutation({
    mutationFn: () => campaignsApi.resume(campaignId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign resumed.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => campaignsApi.delete(campaignId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign deleted.");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const retryMutation = useMutation({
    mutationFn: () => campaignsApi.retry(campaignId),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(`Retrying ${res.retriedCount} failed leads with simulated dispatch!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testSendMutation = useMutation({
    mutationFn: () => {
      if (!testEmail || !testEmail.includes("@")) {
        throw new Error("Please enter a valid recipient email.");
      }
      if (!campaign) throw new Error("Campaign data missing.");
      return campaignsApi.testSend({
        senderIdentityId: campaign.senderIdentityId,
        recipientEmail: testEmail.trim(),
        subject: campaign.subject,
        bodyHtml: campaign.bodyHtml,
      });
    },
    onSuccess: (res) => {
      setShowTestForm(false);
      setTestEmail("");
      toast.success(
        res.simulated
          ? "Test email dispatch simulated successfully! (Dry-run mode)"
          : "Test email delivered successfully via SMTP!"
      );
    },
    onError: (err: Error) => toast.error(`Test failed: ${err.message}`),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs">
        <div className="w-full max-w-2xl bg-background h-full shadow-2xl p-6 flex items-center justify-center">
          <p className="text-sm text-muted-foreground animate-pulse">Loading campaign details…</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return null;
  }

  const badge = STATUS_BADGES[campaign.status];
  const progressPercent =
    campaign.totalLeads > 0
      ? Math.round(((campaign.sentCount + campaign.failedCount) / campaign.totalLeads) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-3xl bg-background h-full shadow-2xl border-l flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/15">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-semibold truncate">{campaign.name}</h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Progress Banner */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Campaign Progress
              </span>
              <span className="text-xs font-bold tabular-nums">
                {campaign.sentCount} sent / {campaign.totalLeads} total ({progressPercent}%)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-base font-bold text-green-600 tabular-nums">
                  {campaign.sentCount}
                </p>
                <p className="text-[10px] text-muted-foreground">Sent</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-base font-bold text-destructive tabular-nums">
                  {campaign.failedCount}
                </p>
                <p className="text-[10px] text-muted-foreground">Failed</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-base font-bold text-foreground tabular-nums">
                  {Math.max(0, campaign.totalLeads - campaign.sentCount - campaign.failedCount)}
                </p>
                <p className="text-[10px] text-muted-foreground">Pending</p>
              </div>
            </div>
          </div>

          {/* Configuration Summary */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border p-3">
              <span className="text-muted-foreground block mb-1">Sender Identity</span>
              <p className="font-semibold text-foreground truncate">
                {campaign.senderDisplayName || "Default"}
              </p>
              <p className="text-muted-foreground truncate">{campaign.senderEmail}</p>
            </div>

            <div className="rounded-lg border p-3">
              <span className="text-muted-foreground block mb-1">Automated Delay</span>
              <p className="font-semibold text-foreground">
                ⏱ {campaign.delaySeconds} seconds between sends
              </p>
              <p className="text-muted-foreground">
                {Math.round(campaign.delaySeconds / 60) || 1} min interval pacing
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {campaign.status === "draft" && (
              <button
                onClick={() => launchMutation.mutate()}
                disabled={launchMutation.isPending}
                className="rounded bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
              >
                {launchMutation.isPending ? "Launching…" : "Launch Campaign 🚀"}
              </button>
            )}

            {campaign.status === "running" && (
              <button
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                className="rounded border bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 px-4 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:opacity-90 transition-colors"
              >
                Pause Campaign ⏸
              </button>
            )}

            {campaign.status === "paused" && (
              <button
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                className="rounded bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Resume Campaign ▶
              </button>
            )}

            {campaign.failedCount > 0 && (
              <button
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
                className="rounded border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 px-3 py-2 text-xs font-semibold transition-colors"
              >
                {retryMutation.isPending ? "Retrying…" : `🔄 Retry Failed (${campaign.failedCount})`}
              </button>
            )}

            <button
              onClick={() => setShowTestForm((v) => !v)}
              className="rounded border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
            >
              ✉ Send Test Email
            </button>

            <button
              onClick={() => {
                if (confirm("Are you sure you want to delete this campaign?")) {
                  deleteMutation.mutate();
                }
              }}
              className="rounded border border-destructive/30 text-destructive hover:bg-destructive/10 px-3 py-2 text-xs font-medium transition-colors ml-auto"
            >
              Delete Campaign
            </button>
          </div>

          {/* Test send form */}
          {showTestForm && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">
                Send a sample email to:
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  className="flex-1 rounded border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="your-email@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <button
                  onClick={() => testSendMutation.mutate()}
                  disabled={testSendMutation.isPending || !testEmail}
                  className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {testSendMutation.isPending ? "Sending…" : "Send Test"}
                </button>
              </div>
            </div>
          )}

          {/* Email Preview */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Email Template
            </h3>
            <div className="rounded-lg border bg-muted/10 p-3 text-xs space-y-1">
              <p>
                <strong className="text-muted-foreground">Subject: </strong>
                {campaign.subject}
              </p>
            </div>
          </div>

          {/* Recipients List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recipients Queue ({leads.length})
              </h3>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {leads.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4 text-center">No leads enrolled.</p>
                ) : (
                  leads.map((lead) => {
                    let statusColor = "bg-muted text-muted-foreground";
                    if (lead.status === "sent")
                      statusColor = "bg-green-500/10 text-green-600 border border-green-500/20";
                    if (lead.status === "queued")
                      statusColor = "bg-blue-500/10 text-blue-600 border border-blue-500/20";
                    if (lead.status === "sending")
                      statusColor = "bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 animate-pulse";
                    if (lead.status === "failed")
                      statusColor = "bg-destructive/10 text-destructive border border-destructive/20";
                    if (lead.status === "skipped")
                      statusColor = "bg-amber-500/10 text-amber-600 border border-amber-500/20";

                    return (
                      <div
                        key={lead.id}
                        className="flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <p className="font-medium text-foreground truncate">{lead.companyName}</p>
                          <p className="text-[11px] text-muted-foreground font-mono truncate">
                            {lead.recipientEmail}
                          </p>
                          {lead.errorMessage && (
                            <p className="text-[10px] text-destructive truncate mt-0.5">
                              ⚠ {lead.errorMessage}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${statusColor}`}
                          >
                            {lead.status}
                          </span>
                          {lead.scheduledAt && lead.status === "queued" && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                              at {new Date(lead.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </p>
                          )}
                          {lead.sentAt && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                              {new Date(lead.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
