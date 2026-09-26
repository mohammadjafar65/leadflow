import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  History,
  RefreshCw,
  Film,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Send,
} from "lucide-react";
import type {
  IgAutomation,
  IgAutomationEvent,
  IgCommentItem,
} from "@/api/instagram";
import { instagramApi } from "@/api/instagram";
import { toast } from "sonner";

interface ActivityPanelProps {
  automation: IgAutomation;
  onClose?: () => void;
}

export function InstagramActivityPanel({ automation }: ActivityPanelProps) {
  const [activeTab, setActiveTab] = useState<"comments" | "events">(
    automation.triggerType === "comment_to_dm" ? "comments" : "events"
  );
  const [events, setEvents] = useState<IgAutomationEvent[]>([]);
  const [comments, setComments] = useState<IgCommentItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [triggeringCommentId, setTriggeringCommentId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "sent" | "failed" | "ignored">("all");
  const [commentFilter, setCommentFilter] = useState<"all" | "matched" | "sent" | "mismatch">("all");
  const [commentSearch, setCommentSearch] = useState("");

  const loadEvents = useCallback(() => {
    setLoadingEvents(true);
    instagramApi
      .listEvents(automation.id, 5000)
      .then(({ events }) => setEvents(events))
      .catch(() => toast.error("Failed to load audit events"))
      .finally(() => setLoadingEvents(false));
  }, [automation.id]);

  const loadComments = useCallback(() => {
    setLoadingComments(true);
    instagramApi
      .getComments(automation.id)
      .then((res) => setComments(res.comments || []))
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [automation.id]);

  useEffect(() => {
    loadEvents();
    loadComments();
  }, [loadEvents, loadComments]);

  const handleSyncComments = async () => {
    setSyncing(true);
    try {
      const res = await instagramApi.syncComments(automation.id);
      if (res.queuedCount > 0) {
        toast.success(`Synced ${res.syncedCount} comments. Queued ${res.queuedCount} deliveries. Check the event log for results.`);
      } else {
        toast.info(`Synced ${res.syncedCount} comments. No pending matching comments.`);
      }
      loadComments();
      loadEvents();
    } catch (err: any) {
      toast.error(err?.message || "Failed to sync comments from Instagram");
    } finally {
      setSyncing(false);
    }
  };

  const handleTriggerComment = async (comment: IgCommentItem) => {
    setTriggeringCommentId(comment.id);
    try {
      const result=await instagramApi.syncComments(automation.id);
      toast.info('Queued '+result.queuedCount+' eligible comments. Check delivery events for outcomes.');
      loadComments();
      loadEvents();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send DM to comment");
    } finally {
      setTriggeringCommentId(null);
    }
  };

  const filteredEvents = events.filter((e) => {
    if (filter === "sent") return e.status === "sent";
    if (filter === "failed") return e.status === "failed";
    if (filter === "ignored") return e.status === "ignored";
    return true;
  });

  const filteredComments = comments.filter((c) => {
    if (commentFilter === "matched" && !c.matchesKeyword) return false;
    if (commentFilter === "sent" && c.status !== "sent") return false;
    if (commentFilter === "mismatch" && c.matchesKeyword) return false;
    if (commentSearch.trim()) {
      const q = commentSearch.toLowerCase().trim();
      const u = (c.from?.username || "").toLowerCase();
      const t = (c.text || "").toLowerCase();
      if (!u.includes(q) && !t.includes(q)) return false;
    }
    return true;
  });

  const reelUrl =
    automation.targetMediaUrl ||
    (automation.targetMediaId
      ? `https://www.instagram.com/p/${automation.targetMediaId}/`
      : null);

  return (
    <div className="w-full h-full bg-[#f8f9fb] dark:bg-[#0f1117] p-6 space-y-5 overflow-y-auto">
      {/* ─── Header & Sync Controls ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-card p-4 rounded-2xl border border-slate-200/80 dark:border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Activity Stream & Delivery Audits
            </h3>
            <span className="text-[11px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded-full border border-purple-200/50">
              {automation.name}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Monitor real-time Reel comments, queue eligible replies, and inspect delivery logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {automation.triggerType === "comment_to_dm" && (
            <button
              onClick={handleSyncComments}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span>{syncing ? "Checking IG..." : "Sync Reel Comments"}</span>
            </button>
          )}

          <button
            onClick={() => {
              loadEvents();
              loadComments();
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-muted text-slate-500"
            title="Refresh"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loadingEvents || loadingComments ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* ─── Nav Tabs ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-border">
        {automation.triggerType === "comment_to_dm" && (
          <button
            onClick={() => setActiveTab("comments")}
            className={`pb-2.5 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === "comments"
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Reel Comments</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-muted">
              {comments.length}
            </span>
          </button>
        )}

        <button
          onClick={() => setActiveTab("events")}
          className={`pb-2.5 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === "events"
              ? "border-purple-600 text-purple-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>DM Delivery Logs</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-muted">
            {events.length}
          </span>
        </button>
      </div>

      {/* ─── TAB 1: REEL COMMENTS ───────────────────────────────────────── */}
      {activeTab === "comments" && (
        <div className="space-y-4">
          {/* Target Reel Banner */}
          <div className="p-4 rounded-2xl bg-white dark:bg-card border border-slate-200/80 dark:border-border shadow-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center shrink-0">
                <Film className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    {automation.targetMediaId ? "Attached Reel" : "All Reels & Posts"}
                  </h4>
                  {reelUrl && (
                    <a
                      href={reelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:underline"
                    >
                      <span>View on Instagram</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate max-w-md">
                  {automation.targetMediaCaption || (automation.targetMediaId ? `Media ID: ${automation.targetMediaId}` : "Monitoring comments across all recent account posts")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {automation.keywords.map((kw) => (
                <span
                  key={kw}
                  className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold border border-purple-200/50"
                >
                  #{kw}
                </span>
              ))}
            </div>
          </div>

          {/* Comment Filters & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: "all", label: `All (${comments.length})` },
                { id: "matched", label: `Matched (${comments.filter((c) => c.matchesKeyword).length})` },
                { id: "sent", label: `Sent / Replied (${comments.filter((c) => c.status === "sent").length})` },
                { id: "mismatch", label: `Mismatches (${comments.filter((c) => !c.matchesKeyword).length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setCommentFilter(tab.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    commentFilter === tab.id
                      ? "bg-purple-600 text-white shadow-2xs"
                      : "bg-white dark:bg-card border border-slate-200 dark:border-border text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative min-w-[200px]">
              <input
                type="text"
                placeholder="Search comments or users..."
                value={commentSearch}
                onChange={(e) => setCommentSearch(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Comments Feed */}
          {loadingComments ? (
            <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
              Fetching comments from Instagram…
            </div>
          ) : filteredComments.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-card border border-dashed text-center text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                {comments.length === 0 ? "No comments found on this Reel yet" : "No comments match current filter/search"}
              </p>
              <p>Click "Sync Reel Comments" above to pull new comments from Instagram.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredComments.map((c) => {
                const username = c.from?.username || "instagram_user";
                const isDelivered = c.status === "sent";
                const isTriggering = triggeringCommentId === c.id;

                return (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-xl bg-white dark:bg-card border border-slate-200/80 dark:border-border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500/20 to-purple-600/20 text-purple-600 font-bold text-xs flex items-center justify-center shrink-0">
                        {username[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            @{username}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(c.timestamp).toLocaleTimeString()}
                          </span>
                          {c.isReply && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 border border-indigo-200/60">
                              ↩ Reply
                            </span>
                          )}
                          {c.matchesKeyword ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                              Matched #{c.matchedKeyword || "KEYWORD"}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
                              Keyword Mismatch
                            </span>
                          )}
                          {isDelivered && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-200">
                              {c.actionTaken || "Delivered"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-muted/30 px-2.5 py-1 rounded-md inline-block">
                          &ldquo;{c.text}&rdquo;
                        </p>
                      </div>
                    </div>

                    {!c.isSelfComment && (
                      <button
                        onClick={() => handleTriggerComment(c)}
                        disabled={isTriggering}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          isDelivered
                            ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                            : "bg-purple-600 text-white hover:bg-purple-700"
                        } disabled:opacity-50 shrink-0`}
                      >
                        {isTriggering ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>{isDelivered ? "Resend DM" : "Sync eligible replies & Reply"}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: AUDIT LOGS ─────────────────────────────────────────── */}
      {activeTab === "events" && (
        <div className="space-y-4">
          {/* Status filters */}
          <div className="flex items-center gap-2">
            {[
              { id: "all", label: `All (${events.length})` },
              { id: "sent", label: `Delivered (${events.filter((e) => e.status === "sent").length})` },
              { id: "failed", label: `Failed (${events.filter((e) => e.status === "failed").length})` },
              { id: "ignored", label: `Ignored (${events.filter((e) => e.status === "ignored").length})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  filter === f.id
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-white dark:bg-card border border-slate-200 dark:border-border text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Table */}
          {loadingEvents ? (
            <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
              Loading audit records...
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-card border border-dashed text-center text-xs text-slate-500">
              No audit records matching this filter.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b bg-slate-50/70 dark:bg-muted/40 text-slate-500 font-semibold">
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Activity / Comment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-border/60">
                  {filteredEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                        @{event.recipientUsername || event.recipientIgId}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                        {event.commentText ? `"${event.commentText}"` : event.triggerType}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            event.status === "sent"
                              ? "bg-emerald-50 text-emerald-600"
                              : event.status === "failed"
                              ? "bg-rose-50 text-rose-600"
                              : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {event.status === "sent" ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          <span className="capitalize">{event.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 font-mono text-[11px]">
                        {new Date(event.createdAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
