import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  instagramApi,
  type IgAccount,
  type IgAutomation,
  type TriggerType,
} from "@/api/instagram";
import {
  Plus,
  RefreshCw,
  Zap,
  Smartphone,
  Send,
  Radio,
  Pencil,
  Trash2,
  Key,
  MessageCircle,
  ChevronDown,
} from "lucide-react";
import { InstagramAutomationModal } from "./instagram-automation-modal";
import { InstagramPhoneModal } from "./instagram-phone-modal";
import { InstagramCredentialsDialog } from "./instagram-credentials-dialog";
import { InstagramActivityPanel } from "./instagram-activity-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const TRIGGER_LABELS: Record<TriggerType, string> = {
  comment_to_dm: "Comment → Auto DM",
  story_reply: "Story Reply / Reaction",
  keyword_dm: "Keyword DM",
  new_follower: "New Follower Welcome",
};

export function InstagramPage() {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [automations, setAutomations] = useState<IgAutomation[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingAutomations, setLoadingAutomations] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active tab: 'automations' | 'activity' | 'credentials'
  const [activeTab, setActiveTab] = useState<"automations" | "activity" | "credentials">(
    "automations"
  );

  // Selected automation for the Activity tab
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  // Modal states
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<IgAutomation | null>(null);
  const [phonePreviewAutomation, setPhonePreviewAutomation] = useState<IgAutomation | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const { accounts } = await instagramApi.listAccounts();
      setAccounts(accounts);
    } catch {
      toast.error("Failed to load connected Instagram accounts");
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const fetchAutomations = useCallback(async () => {
    try {
      const { automations } = await instagramApi.listAutomations();
      setAutomations(automations);
      // Auto select first automation for activity tab if none selected
      if (automations.length > 0) {
        setSelectedActivityId((prev) => prev || automations[0].id);
      }
    } catch {
      toast.error("Failed to load Instagram automations");
    } finally {
      setLoadingAutomations(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([fetchAccounts(), fetchAutomations()]);
    setRefreshing(false);
    toast.success("Instagram data refreshed");
  };

  useEffect(() => {
    void fetchAccounts();
    void fetchAutomations();
  }, [fetchAccounts, fetchAutomations]);

  // Handle Meta OAuth callback code in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    window.history.replaceState({}, "", window.location.pathname);
    instagramApi
      .connectAccount(code, params.get("state") ?? "")
      .then(({ account }) => {
        toast.success(`Connected @${account.username}!`);
        void fetchAccounts();
      })
      .catch(() => {
        toast.error("Instagram connection failed. Please check your Meta App credentials.");
      });
  }, [fetchAccounts]);

  async function handleConnect() {
    try {
      const { url } = await instagramApi.getOAuthUrl();
      window.location.href = url;
    } catch {
      toast.error("Could not initialize Meta OAuth. Ensure META_APP_ID is configured in server/.env");
    }
  }

  async function handleConnectToken(token: string) {
    try {
      const { account } = await instagramApi.connectWithToken(token.trim());
      toast.success(`Connected @${account.username}!`);
      void fetchAccounts();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || (err as Error)?.message || "Failed to connect token";
      toast.error(msg);
      throw err;
    }
  }

  async function handleDisconnect(id: string) {
    if (!confirm("Are you sure you want to disconnect this Instagram account?")) return;
    try {
      await instagramApi.disconnectAccount(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Instagram account disconnected");
    } catch {
      toast.error("Failed to disconnect account");
    }
  }

  async function handleToggle(automation: IgAutomation) {
    try {
      const { automation: updated } = await instagramApi.updateAutomation(automation.id, {
        isActive: !automation.isActive,
      });
      setAutomations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success(updated.isActive ? "Automation turned ON" : "Automation paused");
    } catch {
      toast.error("Failed to update automation status");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this automation? This action cannot be undone.")) return;
    try {
      await instagramApi.deleteAutomation(id);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      toast.success("Automation deleted");
    } catch {
      toast.error("Failed to delete automation");
    }
  }

  const activeCount = automations.filter((a) => a.isActive).length;
  const selectedAccount = accounts[0];
  const currentActivityAutomation =
    automations.find((a) => a.id === selectedActivityId) || automations[0];

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
      {/* ─── 1. Header ────────────────────────────────────────── */}
      <div className="border-b border-border bg-card px-8 py-5 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto w-full">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Instagram DM Automation
              </h1>

              {/* Status Badge */}
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Engine
              </span>

              {selectedAccount && (
                <Badge variant="outline" className="text-xs font-bold text-primary">
                  @{selectedAccount.username}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Automatically detect Reel & post comments, reply publicly, and deliver customized DMs with clickable CTA buttons.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCredentialsModal(true)}
              className="text-xs font-semibold gap-1.5"
            >
              <Key className="w-3.5 h-3.5 text-primary" />
              <span>Meta Connection</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-xs font-semibold gap-1.5"
              title="Refresh status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>

            <Button
              size="sm"
              onClick={() => {
                setEditingAutomation(null);
                setShowBuilderModal(true);
              }}
              className="text-xs font-bold gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Automation</span>
            </Button>
          </div>
        </div>

        {/* ─── 2. Metric KPI Cards ────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-5 max-w-7xl mx-auto w-full">
          {/* KPI 1: Profile */}
          <Card
            onClick={() => setShowCredentialsModal(true)}
            className="cursor-pointer hover:border-primary/40 transition-colors shadow-2xs border-border"
          >
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-pink-500/10 text-pink-600 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">Connected Account</p>
                <p className="text-sm font-bold truncate text-foreground">
                  {selectedAccount ? `@${selectedAccount.username}` : "Not Connected"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* KPI 2: Live Automations */}
          <Card className="shadow-2xs border-border">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">Active Automations</p>
                <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <span>
                    {activeCount} of {automations.length} Live
                  </span>
                  {activeCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* KPI 3: DM Buttons */}
          <Card className="shadow-2xs border-border">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                <Send className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">DM Dispatch</p>
                <p className="text-sm font-bold text-foreground">Button CTA Links</p>
              </div>
            </CardContent>
          </Card>

          {/* KPI 4: Webhook */}
          <Card className="shadow-2xs border-border">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <Radio className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">Engine Status</p>
                <p className="text-sm font-bold text-foreground">Poller & Webhooks Active</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── 3. Tabs Navigation ────────────────────────── */}
        <div className="flex items-center gap-6 mt-6 border-t border-border pt-3 max-w-7xl mx-auto w-full">
          <button
            onClick={() => setActiveTab("automations")}
            className={`pb-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "automations"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>Automations</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted font-mono">
              {automations.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("activity")}
            className={`pb-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "activity"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Reel Activity & Delivery Logs</span>
          </button>

          <button
            onClick={() => setActiveTab("credentials")}
            className={`pb-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "credentials"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Settings & Meta App</span>
          </button>
        </div>
      </div>

      {/* ─── 4. Body Content ────────────────────────────────────── */}
      <div className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* TAB 1: AUTOMATIONS LIST */}
        {activeTab === "automations" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">Active Comment-to-DM Automations</h2>
                <p className="text-xs text-muted-foreground">
                  Trigger customized messages with website buttons whenever followers comment on your Reels or posts.
                </p>
              </div>

              <Button
                onClick={() => {
                  setEditingAutomation(null);
                  setShowBuilderModal(true);
                }}
                size="sm"
                className="text-xs font-bold gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Automation</span>
              </Button>
            </div>

            {loadingAutomations ? (
              <div className="py-16 text-center text-xs text-muted-foreground animate-pulse">
                Loading automations…
              </div>
            ) : automations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-foreground">No automations created yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Set up your first Comment-to-DM flow to automatically send link buttons whenever users comment on your Reels!
                </p>
                <Button
                  onClick={() => {
                    setEditingAutomation(null);
                    setShowBuilderModal(true);
                  }}
                  size="sm"
                  className="font-bold text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  <span>Create First Automation</span>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {automations.map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-2xl border p-5 transition-all bg-card flex flex-col justify-between gap-4 shadow-xs hover:shadow-md ${
                      a.isActive
                        ? "border-emerald-500/30 ring-1 ring-emerald-500/10"
                        : "border-border"
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Trigger Badge & Active Toggle */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                          {TRIGGER_LABELS[a.triggerType as TriggerType] || a.triggerType}
                        </span>

                        {/* Status Toggle */}
                        <button
                          onClick={() => handleToggle(a)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            a.isActive ? "bg-emerald-500" : "bg-muted border border-border"
                          }`}
                          title={a.isActive ? "Click to pause" : "Click to activate"}
                        >
                          <span
                            className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                              a.isActive ? "translate-x-5" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold text-foreground truncate">{a.name}</h3>

                      {/* Keywords Chips */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {a.keywords.slice(0, 3).map((kw) => (
                          <span
                            key={kw}
                            className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-bold text-foreground border border-border"
                          >
                            #{kw}
                          </span>
                        ))}
                        {a.keywords.length > 3 && (
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            +{a.keywords.length - 3}
                          </span>
                        )}
                        {a.targetMediaCaption && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[130px]">
                            🎬 {a.targetMediaCaption}
                          </span>
                        )}
                      </div>

                      {/* Message preview */}
                      <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-xl border border-border line-clamp-2 leading-relaxed italic">
                        &ldquo;{a.messageTemplate}&rdquo;
                      </p>

                      {/* Attached Button Tag */}
                      {a.linkUrl && (
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-500/20">
                          <Send className="w-3 h-3" />
                          <span className="truncate">Button: {a.buttonLabel || "Open Link"}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div className="pt-3 border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPhonePreviewAutomation(a)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Preview DM</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedActivityId(a.id);
                            setActiveTab("activity");
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                          title="View live comments & delivery events"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Activity</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingAutomation(a);
                            setShowBuilderModal(true);
                          }}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Edit Automation"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          title="Delete Automation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REEL ACTIVITY & DELIVERY LOGS WITH AUTOMATION SELECTOR */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            {automations.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-xs bg-card rounded-2xl border border-border">
                Create an automation first to monitor Reel activity and DM logs.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Automation Selector Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card shadow-2xs">
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Selecting Automation</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Viewing live comments and delivery logs for:
                    </p>
                  </div>

                  <div className="relative">
                    <select
                      value={selectedActivityId || automations[0]?.id}
                      onChange={(e) => setSelectedActivityId(e.target.value)}
                      className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8 cursor-pointer"
                    >
                      {automations.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({TRIGGER_LABELS[a.triggerType as TriggerType] || a.triggerType})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2.5 pointer-events-none text-muted-foreground" />
                  </div>
                </div>

                {currentActivityAutomation && (
                  <InstagramActivityPanel
                    key={currentActivityAutomation.id}
                    automation={currentActivityAutomation}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SETTINGS & CREDENTIALS */}
        {activeTab === "credentials" && (
          <div className="max-w-2xl bg-card p-6 rounded-2xl border border-border space-y-6 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Meta App Configuration & Instagram Connection
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Connect your professional Instagram Business or Creator account linked to a Meta developer app.
              </p>
            </div>

            {/* Connected Account Info */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-foreground">Connected Profiles</h3>

              {loadingAccounts ? (
                <p className="text-xs text-muted-foreground animate-pulse">Loading profile…</p>
              ) : accounts.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-border text-center space-y-3">
                  <p className="text-xs text-muted-foreground font-medium">
                    No Instagram account connected yet
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      onClick={handleConnect}
                      size="sm"
                      className="bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 text-white text-xs font-bold shadow-xs"
                    >
                      Connect via Meta OAuth
                    </Button>
                  </div>
                </div>
              ) : (
                accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-4 rounded-xl border border-border flex items-center justify-between bg-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm">
                        {acc.username[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">@{acc.username}</p>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded border border-primary/20">
                          Professional Creator / Business
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(acc.id)}
                      className="text-destructive hover:bg-destructive/10 text-xs font-bold"
                    >
                      Disconnect
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* Manual Token input shortcut */}
            <div className="pt-2 flex items-center justify-between border-t border-border">
              <p className="text-xs text-muted-foreground">
                Need to connect via custom Access Token directly?
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCredentialsModal(true)}
                className="text-xs text-primary font-bold hover:underline"
              >
                Paste Access Token Directly →
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── 5. Modals ───────────────────────────────────────────────── */}
      <InstagramAutomationModal
        isOpen={showBuilderModal}
        onClose={() => {
          setShowBuilderModal(false);
          setEditingAutomation(null);
        }}
        accounts={accounts}
        initialData={editingAutomation}
        onSaved={(a) => {
          setAutomations((prev) => {
            const exists = prev.some((item) => item.id === a.id);
            if (exists) {
              return prev.map((item) => (item.id === a.id ? a : item));
            }
            return [a, ...prev];
          });
        }}
      />

      <InstagramPhoneModal
        isOpen={!!phonePreviewAutomation}
        onClose={() => setPhonePreviewAutomation(null)}
        automation={phonePreviewAutomation}
        account={accounts[0] || null}
      />

      <InstagramCredentialsDialog
        isOpen={showCredentialsModal}
        onClose={() => setShowCredentialsModal(false)}
        accounts={accounts}
        loading={loadingAccounts}
        onConnect={handleConnect}
        onConnectToken={handleConnectToken}
        onDisconnect={handleDisconnect}
      />
    </div>
  );
}
