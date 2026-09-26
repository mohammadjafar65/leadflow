import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { campaignsApi } from "@/api/campaigns";
import type { CampaignStatus } from "@/types/campaign";
import { CreateCampaignModal } from "@/components/campaigns/create-campaign-modal";
import { CampaignDetailDrawer } from "@/components/campaigns/campaign-detail-drawer";

const STATUS_BADGES: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  scheduled: { label: "Scheduled", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  running: { label: "Running", className: "bg-green-500/10 text-green-600 border-green-500/20 animate-pulse" },
  paused: { label: "Paused", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  completed: { label: "Completed", className: "bg-green-600/15 text-green-700 border-green-600/30" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function CampaignsTab() {
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => campaignsApi.list(),
    refetchInterval: 5000, // Poll every 5s for live progress updates
  });

  const campaigns = data?.campaigns ?? [];

  const launchMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.launch(id),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(`Campaign launched! Queued ${res.queuedCount} emails.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.pause(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.info("Campaign paused.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.resume(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign resumed.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Calculate metrics
  const totalCampaigns = campaigns.length;
  const totalSent = campaigns.reduce((acc, c) => acc + c.sentCount, 0);
  const runningCount = campaigns.filter((c) => c.status === "running").length;
  const avgDelaySeconds =
    campaigns.length > 0
      ? Math.round(campaigns.reduce((acc, c) => acc + c.delaySeconds, 0) / campaigns.length)
      : 60;

  const filteredCampaigns = campaigns.filter((c) => {
    if (statusFilter === "all") return true;
    return c.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Email Campaigns</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Phase 3 Outreach Engine · Automated drip dispatch with 1-min or custom delay
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span>+</span> New Campaign
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Campaigns</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{totalCampaigns}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Emails Delivered</p>
          <p className="text-2xl font-bold text-green-600 mt-1 tabular-nums">
            {totalSent.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Active Running</p>
          <p className="text-2xl font-bold text-primary mt-1 tabular-nums">{runningCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Avg Send Delay</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">
            {avgDelaySeconds >= 60 ? `${Math.round(avgDelaySeconds / 60)} min` : `${avgDelaySeconds}s`}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b text-xs">
        {["all", "running", "draft", "paused", "completed"].map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-3.5 py-2 font-medium capitalize border-b-2 transition-colors ${
              statusFilter === tab
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "all" ? "All Campaigns" : tab}
          </button>
        ))}
      </div>

      {/* Campaigns Table or Empty State */}
      {isLoading ? (
        <div className="rounded-xl border p-10 text-center text-xs text-muted-foreground">
          Loading campaigns…
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center max-w-lg mx-auto">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3 text-lg">
            ✉
          </div>
          <h3 className="text-sm font-semibold">No campaigns found</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {statusFilter === "all"
              ? "Create your first email campaign to begin automated cold outreach with custom pacing."
              : `No campaigns currently matching "${statusFilter}".`}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
          >
            + Create Campaign
          </button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/30 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Campaign Name</th>
                  <th className="px-4 py-3">Sender Identity</th>
                  <th className="px-4 py-3">Delay Pacing</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCampaigns.map((camp) => {
                  const badge = STATUS_BADGES[camp.status] || STATUS_BADGES.draft;
                  const progress =
                    camp.totalLeads > 0
                      ? Math.round(((camp.sentCount + camp.failedCount) / camp.totalLeads) * 100)
                      : 0;

                  return (
                    <tr
                      key={camp.id}
                      onClick={() => setSelectedCampaignId(camp.id)}
                      className="hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="truncate max-w-xs">{camp.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate font-normal mt-0.5">
                          {camp.subject}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="font-medium text-foreground truncate max-w-xs">
                          {camp.senderDisplayName || "Default"}
                        </div>
                        <div className="text-[11px] truncate">{camp.senderEmail}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[11px] font-medium text-foreground">
                          ⏱ {camp.delaySeconds >= 60 ? `${Math.round(camp.delaySeconds / 60)} min` : `${camp.delaySeconds}s`}
                        </span>
                      </td>

                      <td className="px-4 py-3 min-w-[140px]">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="tabular-nums font-medium">
                            {camp.sentCount} / {camp.totalLeads}
                          </span>
                          <span className="text-muted-foreground">{progress}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {camp.status === "draft" && (
                          <button
                            onClick={() => launchMutation.mutate(camp.id)}
                            disabled={launchMutation.isPending}
                            className="px-2 py-1 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors"
                          >
                            Launch 🚀
                          </button>
                        )}
                        {camp.status === "running" && (
                          <button
                            onClick={() => pauseMutation.mutate(camp.id)}
                            disabled={pauseMutation.isPending}
                            className="px-2 py-1 rounded border text-[11px] font-medium hover:bg-muted transition-colors"
                          >
                            Pause ⏸
                          </button>
                        )}
                        {camp.status === "paused" && (
                          <button
                            onClick={() => resumeMutation.mutate(camp.id)}
                            disabled={resumeMutation.isPending}
                            className="px-2 py-1 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors"
                          >
                            Resume ▶
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedCampaignId(camp.id)}
                          className="px-2 py-1 rounded border text-[11px] font-medium hover:bg-muted transition-colors text-muted-foreground"
                        >
                          Details →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateCampaignModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(id) => {
            setSelectedCampaignId(id);
          }}
        />
      )}

      {/* Campaign Detail Drawer */}
      {selectedCampaignId && (
        <CampaignDetailDrawer
          campaignId={selectedCampaignId}
          onClose={() => setSelectedCampaignId(null)}
        />
      )}
    </div>
  );
}
