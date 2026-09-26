import { useState, useEffect } from "react";
import {
  X,
  Zap,
  Film,
  Search,
  ExternalLink,
  ChevronRight,
  Phone,
  Video,
  Sparkles,
  Heart,
  RefreshCw,
} from "lucide-react";
import type {
  IgAccount,
  IgAutomation,
  IgMediaItem,
  TriggerType,
  CreateAutomationPayload,
  UpdateAutomationPayload,
} from "@/api/instagram";
import { instagramApi } from "@/api/instagram";
import { toast } from "sonner";

interface AutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: IgAccount[];
  initialData?: IgAutomation | null;
  onSaved: (automation: IgAutomation) => void;
}

const TRIGGER_OPTIONS: {
  type: TriggerType;
  title: string;
  desc: string;
  icon: string;
}[] = [
  {
    type: "comment_to_dm",
    title: "Reel / Post Comment",
    desc: "Auto-DMs anyone who comments on your Reel",
    icon: "💬",
  },
  {
    type: "keyword_dm",
    title: "Keyword DM",
    desc: "Auto-replies when someone sends a DM keyword",
    icon: "📩",
  },
  {
    type: "story_reply",
    title: "Story Reply",
    desc: "Replies when someone reacts or replies to a Story",
    icon: "📱",
  },

];

export function InstagramAutomationModal({
  isOpen,
  onClose,
  accounts,
  initialData,
  onSaved,
}: AutomationModalProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [accountId, setAccountId] = useState(
    initialData?.instagramAccountId ?? accounts[0]?.id ?? ""
  );
  const [triggerType, setTriggerType] = useState<TriggerType>(
    initialData?.triggerType ?? "comment_to_dm"
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>(
    initialData?.keywords ?? ["LINK"]
  );
  const [message, setMessage] = useState(
    initialData?.messageTemplate ??
      "Hey! Here is the link you asked for on our Reel 👇"
  );
  const [link, setLink] = useState(initialData?.linkUrl ?? "");
  const [buttonLabel, setButtonLabel] = useState(
    initialData?.buttonLabel ?? "Open Link"
  );
  const [commentReply, setCommentReply] = useState(
    initialData?.commentReplyTemplate ?? "I have sent the link! Please check your DM 📩"
  );
  const [targetMode, setTargetMode] = useState<"all" | "specific">(
    initialData?.targetMediaId ? "specific" : "all"
  );
  const [targetMediaId, setTargetMediaId] = useState<string | null>(
    initialData?.targetMediaId ?? null
  );
  const [targetMediaUrl, setTargetMediaUrl] = useState<string | null>(
    initialData?.targetMediaUrl ?? null
  );
  const [targetMediaCaption, setTargetMediaCaption] = useState<string | null>(
    initialData?.targetMediaCaption ?? null
  );

  const [mediaList, setMediaList] = useState<IgMediaItem[]>([]);
  const [mediaSearchQuery, setMediaSearchQuery] = useState("");
  const [reelUrlInput, setReelUrlInput] = useState("");
  const [resolvingReel, setResolvingReel] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleResolveReelUrl = async () => {
    const cleanUrl = reelUrlInput.trim().split("?")[0].replace(/\/+$/, "");
    if (!cleanUrl) {
      toast.error("Please enter an Instagram Reel URL or Shortcode");
      return;
    }
    setResolvingReel(true);
    try {
      const activeAcctId = accountId || accounts[0]?.id || "";
      const { media } = await instagramApi.resolveReel(activeAcctId, cleanUrl);
      if (media && media.id) {
        setTargetMediaId(media.id);
        setTargetMediaUrl(media.permalink || cleanUrl);
        setTargetMediaCaption(media.caption ? media.caption.slice(0, 80) : "Instagram Reel");
        toast.success("Instagram Reel linked successfully!");
        setReelUrlInput("");
      } else {
        toast.error("Could not find this Reel on your connected Instagram account.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to resolve Reel URL");
    } finally {
      setResolvingReel(false);
    }
  };

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setAccountId(initialData.instagramAccountId);
      setTriggerType(initialData.triggerType);
      setKeywords(initialData.keywords || []);
      setMessage(initialData.messageTemplate || "");
      setLink(initialData.linkUrl || "");
      setButtonLabel(initialData.buttonLabel || "Open Link");
      setCommentReply(
        initialData.commentReplyTemplate || "I have sent the link! Please check your DM 📩"
      );
      setTargetMode(initialData.targetMediaId ? "specific" : "all");
      setTargetMediaId(initialData.targetMediaId || null);
      setTargetMediaUrl(initialData.targetMediaUrl || null);
      setTargetMediaCaption(initialData.targetMediaCaption || null);
      setReelUrlInput("");
    } else {
      setName("");
      setAccountId(accounts[0]?.id ?? "");
      setTriggerType("comment_to_dm");
      setKeywords(["LINK"]);
      setMessage("Hey! Here is the link you requested on our Reel 👇");
      setLink("");
      setButtonLabel("Open Link");
      setCommentReply("I have sent the link! Please check your DM 📩");
      setTargetMode("all");
      setTargetMediaId(null);
      setTargetMediaUrl(null);
      setTargetMediaCaption(null);
      setReelUrlInput("");
    }
  }, [initialData, accounts, isOpen]);

  // Fetch media when comment_to_dm trigger is active
  useEffect(() => {
    if (triggerType === "comment_to_dm" && accountId && isOpen) {
      instagramApi
        .getMedia(accountId)
        .then(({ media }) => setMediaList(media))
        .catch(() => {});
    }
  }, [accountId, triggerType, isOpen]);

  if (!isOpen) return null;

  const addKeyword = (kwToAdd?: string) => {
    const kw = (kwToAdd ?? keywordInput).trim().toUpperCase();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
    }
    if (!kwToAdd) setKeywordInput("");
  };

  const removeKeyword = (kwToRemove: string) => {
    setKeywords(keywords.filter((k) => k !== kwToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please enter a direct message template");
      return;
    }

    setSaving(true);
    try {
      if (initialData) {
        const payload: UpdateAutomationPayload = {
          name: name.trim() || `Reel Auto-DM (${keywords.join(", ") || "All"})`,
          triggerType,
          keywords,
          messageTemplate: message.trim(),
          linkUrl: link.trim() || "",
          buttonLabel: buttonLabel.trim() || "",
          commentReplyTemplate:
            triggerType === "comment_to_dm" ? commentReply.trim() || "" : "",
          targetMediaId:
            triggerType === "comment_to_dm" && targetMode === "specific" ? targetMediaId : null,
          targetMediaUrl:
            triggerType === "comment_to_dm" && targetMode === "specific" ? targetMediaUrl : null,
          targetMediaCaption:
            triggerType === "comment_to_dm" && targetMode === "specific" ? targetMediaCaption : null,
        };
        const { automation } = await instagramApi.updateAutomation(initialData.id, payload);
        toast.success("Automation updated successfully");
        onSaved(automation);
        onClose();
      } else {
        const payload: CreateAutomationPayload = {
          instagramAccountId: accountId || accounts[0]?.id || "",
          name: name.trim() || `Reel Auto-DM (${keywords.join(", ") || "All"})`,
          triggerType,
          keywords,
          messageTemplate: message.trim(),
          linkUrl: link.trim() || undefined,
          buttonLabel: buttonLabel.trim() || undefined,
          commentReplyTemplate:
            triggerType === "comment_to_dm" ? commentReply.trim() || undefined : undefined,
          targetMediaId:
            triggerType === "comment_to_dm" && targetMode === "specific" ? targetMediaId : null,
          targetMediaUrl:
            triggerType === "comment_to_dm" && targetMode === "specific" ? targetMediaUrl : null,
          targetMediaCaption:
            triggerType === "comment_to_dm" && targetMode === "specific" ? targetMediaCaption : null,
        };
        const { automation } = await instagramApi.createAutomation(payload);
        toast.success("Automation created successfully! Turn toggle ON to go live.");
        onSaved(automation);
        onClose();
      }
    } catch {
      toast.error(initialData ? "Failed to update automation" : "Failed to create automation");
    } finally {
      setSaving(false);
    }
  };

  const filteredMedia = mediaList.filter((m) =>
    (m.caption || "").toLowerCase().includes(mediaSearchQuery.toLowerCase())
  );

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? accounts[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl h-[90vh] max-h-[800px] flex flex-col rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-card text-slate-900 dark:text-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {initialData ? "Edit Automation" : "Create Instagram Automation"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Set keyword triggers, public replies, and interactive DM button links.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: Left Form + Right Live Phone Mockup */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50/40 dark:bg-card/40">
            {/* Left Form: 7 cols */}
            <div className="md:col-span-7 space-y-4">
              {/* Name & Account */}
              <div className="p-4 rounded-xl border border-slate-200/80 dark:border-border bg-white dark:bg-card space-y-3 shadow-xs">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Automation Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Blueprint Link Auto-DM"
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                {accounts.length > 1 && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Target Instagram Account
                    </label>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card px-3 py-2"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          @{a.username}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Trigger Type Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  1. Trigger Event
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRIGGER_OPTIONS.map((opt) => {
                    const isSelected = triggerType === opt.type;
                    return (
                      <div
                        key={opt.type}
                        onClick={() => setTriggerType(opt.type)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 ${
                          isSelected
                            ? "border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 ring-1 ring-purple-600/30"
                            : "border-slate-200/80 dark:border-border bg-white dark:bg-card hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{opt.icon}</span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {opt.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-tight">
                          {opt.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Keywords */}
              {(triggerType === "comment_to_dm" || triggerType === "keyword_dm") && (
                <div className="p-4 rounded-xl border border-slate-200/80 dark:border-border bg-white dark:bg-card space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      2. Keywords
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {keywords.length} active
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addKeyword();
                        }
                      }}
                      placeholder="Type a keyword and press Enter (e.g. LINK)"
                      className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => addKeyword()}
                      disabled={!keywordInput.trim()}
                      className="px-3 py-2 rounded-lg bg-purple-600 text-white text-xs font-bold disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {keywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 text-purple-700 dark:text-purple-300 text-xs font-bold shadow-2xs"
                      >
                        <span>#{kw}</span>
                        <button
                          type="button"
                          onClick={() => removeKeyword(kw)}
                          className="hover:text-rose-500 text-slate-400 font-bold ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Suggestion pills */}
                  <div className="flex items-center gap-1 flex-wrap pt-1">
                    <span className="text-[10px] text-slate-400 font-medium">Quick presets:</span>
                    {["LINK", "INFO", "PRICE", "GUIDE", "START"].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => addKeyword(preset)}
                        className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-muted px-2 py-0.5 rounded-md hover:bg-slate-200 transition-colors"
                      >
                        +{preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Target Reel Selector */}
              {triggerType === "comment_to_dm" && (
                <div className="p-4 rounded-xl border border-slate-200/80 dark:border-border bg-white dark:bg-card space-y-3 shadow-xs">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    3. Target Reel or Post
                  </label>

                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-muted text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setTargetMode("all");
                        setTargetMediaId(null);
                        setTargetMediaUrl(null);
                        setTargetMediaCaption(null);
                      }}
                      className={`py-1.5 rounded-lg transition-all ${
                        targetMode === "all"
                          ? "bg-white dark:bg-card text-slate-900 dark:text-white shadow-2xs font-bold"
                          : "text-slate-500"
                      }`}
                    >
                      All Reels & Posts
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetMode("specific")}
                      className={`py-1.5 rounded-lg transition-all ${
                        targetMode === "specific"
                          ? "bg-white dark:bg-card text-slate-900 dark:text-white shadow-2xs font-bold"
                          : "text-slate-500"
                      }`}
                    >
                      Specific Reel
                    </button>
                  </div>

                  {targetMode === "specific" && (
                    <div className="space-y-2 pt-1">
                      {targetMediaId ? (
                        <div className="p-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <Film className="w-4 h-4 text-purple-600 shrink-0" />
                            <span className="truncate text-slate-800 dark:text-slate-100 font-medium">
                              {targetMediaCaption || `Reel ID: ${targetMediaId}`}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetMediaId(null);
                              setTargetMediaUrl(null);
                              setTargetMediaCaption(null);
                            }}
                            className="text-xs text-rose-600 font-bold hover:underline shrink-0"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-50 dark:bg-muted/40 border border-slate-200/80 dark:border-border">
                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                              Option A: Paste Instagram Reel Link / URL
                            </label>
                            <div className="flex gap-1.5">
                              <input
                                type="url"
                                value={reelUrlInput}
                                onChange={(e) => setReelUrlInput(e.target.value)}
                                placeholder="https://www.instagram.com/reel/DddgnMNIr-P/..."
                                className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                              <button
                                type="button"
                                onClick={handleResolveReelUrl}
                                disabled={resolvingReel || !reelUrlInput.trim()}
                                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1 shrink-0"
                              >
                                {resolvingReel ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                                <span>{resolvingReel ? "Resolving..." : "Link Reel"}</span>
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 my-1">
                            <div className="flex-1 h-px bg-slate-200 dark:bg-border" />
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">or choose recent</span>
                            <div className="flex-1 h-px bg-slate-200 dark:bg-border" />
                          </div>

                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={mediaSearchQuery}
                              onChange={(e) => setMediaSearchQuery(e.target.value)}
                              placeholder="Search recent Reels by caption…"
                              className="w-full text-xs rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card pl-8 pr-3 py-2"
                            />
                          </div>

                          {filteredMedia.length > 0 && (
                            <div className="max-h-36 overflow-y-auto space-y-1 rounded-xl border border-slate-200 dark:border-border p-1.5 bg-white dark:bg-card">
                              {filteredMedia.slice(0, 5).map((m) => (
                                <div
                                  key={m.id}
                                  onClick={() => {
                                    setTargetMediaId(m.id);
                                    setTargetMediaUrl(
                                      m.permalink || `https://www.instagram.com/p/${m.id}/`
                                    );
                                    setTargetMediaCaption((m.caption || "").slice(0, 80));
                                  }}
                                  className="p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer flex items-center justify-between text-xs"
                                >
                                  <span className="truncate text-slate-700 dark:text-slate-300 max-w-[220px]">
                                    {m.caption || "(No caption)"}
                                  </span>
                                  <span className="text-purple-600 font-bold text-[11px]">
                                    Select
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Direct Message */}
              <div className="p-4 rounded-xl border border-slate-200/80 dark:border-border bg-white dark:bg-card space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    4. Direct Message (DM) Content
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {message.length} chars
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Hey! Here is the link you requested 👇"
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card p-3 focus:outline-none focus:ring-1 focus:ring-purple-500 leading-relaxed resize-none"
                  required
                />
              </div>

              {/* Button CTA Link */}
              <div className="p-4 rounded-xl border border-slate-200/80 dark:border-border bg-white dark:bg-card space-y-2 shadow-xs">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  5. Native Button CTA (Optional)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    maxLength={20}
                    value={buttonLabel}
                    onChange={(e) => setButtonLabel(e.target.value)}
                    placeholder="Button Label (e.g. Open Link)"
                    className="text-xs rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card px-3 py-2"
                  />
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="text-xs rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card px-3 py-2"
                  />
                </div>
              </div>

              {/* Public Reel Reply */}
              {triggerType === "comment_to_dm" && (
                <div className="p-4 rounded-xl border border-slate-200/80 dark:border-border bg-white dark:bg-card space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      6. Public Comment Reply
                    </label>
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 rounded">
                      Boosts Reach
                    </span>
                  </div>
                  <input
                    type="text"
                    value={commentReply}
                    onChange={(e) => setCommentReply(e.target.value)}
                    placeholder="I have sent the link! Please check your DM 📩"
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card px-3 py-2"
                  />
                </div>
              )}
            </div>

            {/* Right Column: Clean Live Smartphone Preview (5 cols) */}
            <div className="md:col-span-5 flex flex-col items-center justify-center">
              <div className="w-full max-w-[280px] rounded-[2.5rem] border-[4px] border-slate-700 bg-neutral-950 p-2.5 shadow-xl text-white select-none">
                {/* Dynamic island */}
                <div className="w-20 h-3 bg-neutral-900 rounded-full mx-auto mb-1.5 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-neutral-800" />
                </div>

                {/* Smartphone screen */}
                <div className="rounded-[1.8rem] bg-neutral-900 border border-neutral-800 flex flex-col overflow-hidden text-neutral-100 min-h-[440px]">
                  {/* IG Direct Header */}
                  <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-900/90">
                    <div className="flex items-center gap-1.5">
                      <ChevronRight className="w-3.5 h-3.5 rotate-180 text-neutral-400" />
                      <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        {(selectedAccount?.username || "Y")[0].toUpperCase()}
                      </div>
                      <span className="text-[11px] font-bold truncate max-w-[100px]">
                        @{selectedAccount?.username || "youraccount"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-neutral-400">
                      <Phone className="w-3 h-3" />
                      <Video className="w-3 h-3" />
                    </div>
                  </div>

                  {/* Chat messages stream */}
                  <div className="flex-1 p-3 overflow-y-auto space-y-2.5 flex flex-col justify-end text-[11px]">
                    <p className="text-[9px] text-neutral-500 text-center">Today 2:45 PM</p>

                    {/* Trigger bubble */}
                    {triggerType === "comment_to_dm" && (
                      <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-2 text-[10px] text-neutral-300 space-y-1">
                        <p className="text-purple-400 font-bold uppercase text-[9px]">
                          🎬 Reel Comment
                        </p>
                        <p>
                          <strong className="text-white">@user</strong>: "{keywords[0] || "LINK"}"
                        </p>
                        {commentReply && (
                          <p className="text-emerald-400 text-[9px] truncate">
                            Replied: "{commentReply}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* DM bubble */}
                    <div className="flex justify-end">
                      <div className="max-w-[95%] rounded-2xl rounded-tr-xs bg-gradient-to-br from-purple-600 to-indigo-700 text-white p-2.5 space-y-2 shadow-sm">
                        <p className="leading-tight whitespace-pre-wrap">{message}</p>

                        {link && (
                          <div className="w-full py-1.5 px-2.5 rounded-lg bg-white/20 hover:bg-white/30 border border-white/30 text-center font-bold text-[10px] text-white flex items-center justify-center gap-1">
                            <span>{buttonLabel || "Open Link"}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-[9px] text-neutral-500 text-right">Sent automatically ✓</p>
                  </div>

                  {/* Mock IG chat bar */}
                  <div className="p-2 border-t border-neutral-800 bg-neutral-900/90 flex items-center justify-between gap-1.5 shrink-0">
                    <Sparkles className="w-3 h-3 text-neutral-400" />
                    <div className="flex-1 bg-neutral-800 rounded-full px-2.5 py-1 text-[10px] text-neutral-400">
                      Message…
                    </div>
                    <Heart className="w-3 h-3 text-neutral-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-3.5 border-t border-slate-100 dark:border-border bg-white dark:bg-card flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-border text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>{initialData ? "Save Changes" : "Create Automation"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
