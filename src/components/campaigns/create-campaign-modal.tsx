import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { campaignsApi } from "@/api/campaigns";
import { apiClient } from "@/lib/api-client";
import type { SenderIdentity, Template } from "@/types/outreach";
import type { Lead } from "@/types/lead";

interface CreateCampaignModalProps {
  onClose: () => void;
  onSuccess: (campaignId: string) => void;
  preselectedLeadIds?: string[];
}

function formatCategory(cat?: string | null): string {
  if (!cat || !cat.trim()) return "Uncategorized";
  return cat
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function getCategoryIcon(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("coffee") || c.includes("cafe")) return "☕";
  if (c.includes("restaurant") || c.includes("food") || c.includes("bakery") || c.includes("bar")) return "🍽️";
  if (c.includes("dentist") || c.includes("dental")) return "🦷";
  if (c.includes("doctor") || c.includes("health") || c.includes("clinic") || c.includes("medical") || c.includes("physio")) return "🏥";
  if (c.includes("law") || c.includes("attorney") || c.includes("legal")) return "⚖️";
  if (c.includes("plumb")) return "🔧";
  if (c.includes("electric")) return "⚡";
  if (c.includes("roof") || c.includes("build") || c.includes("contractor")) return "🔨";
  if (c.includes("real_estate") || c.includes("property")) return "🏢";
  if (c.includes("auto") || c.includes("car") || c.includes("tire")) return "🚗";
  if (c.includes("clean")) return "✨";
  if (c.includes("gym") || c.includes("fitness") || c.includes("yoga")) return "💪";
  return "🏷️";
}

interface CategoryHeaderProps {
  category: string;
  totalCount: number;
  withEmailCount: number;
  selectedCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleSelect: () => void;
}

function CategoryHeader({
  category,
  totalCount,
  withEmailCount,
  selectedCount,
  isCollapsed,
  onToggleCollapse,
  onToggleSelect,
}: CategoryHeaderProps) {
  const isAllSelected = withEmailCount > 0 && selectedCount === withEmailCount;
  const isPartiallySelected = selectedCount > 0 && !isAllSelected;

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between bg-muted/90 backdrop-blur-sm px-3 py-2 border-b border-border/70 text-xs select-none">
      <div className="flex items-center gap-2 min-w-0">
        <input
          type="checkbox"
          checked={isAllSelected}
          ref={(el) => {
            if (el) el.indeterminate = isPartiallySelected;
          }}
          disabled={withEmailCount === 0}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="rounded border cursor-pointer"
          title={withEmailCount === 0 ? "No leads with email in this category" : "Select or deselect all in this category"}
        />
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 hover:text-foreground text-left truncate font-semibold"
        >
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
              isCollapsed ? "-rotate-90" : "rotate-0"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-sm leading-none mr-0.5">{getCategoryIcon(category)}</span>
          <span className="text-foreground">{formatCategory(category)}</span>
          <span className="text-[11px] font-normal text-muted-foreground ml-1">
            ({totalCount} lead{totalCount !== 1 ? "s" : ""})
          </span>
          {selectedCount > 0 && (
            <span className="text-[10px] font-medium bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
              {selectedCount} selected
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {withEmailCount > 0 ? (
          <button
            type="button"
            onClick={onToggleSelect}
            className="text-[11px] text-primary hover:underline font-medium"
          >
            {isAllSelected ? "Deselect Category" : `Select All in ${formatCategory(category)} (${withEmailCount})`}
          </button>
        ) : (
          <span className="text-muted-foreground/60 italic text-[10px]">No emails</span>
        )}
      </div>
    </div>
  );
}

export function CreateCampaignModal({
  onClose,
  onSuccess,
  preselectedLeadIds = [],
}: CreateCampaignModalProps) {
  const qc = useQueryClient();

  // Queries
  const { data: identitiesData, isLoading: loadingIdentities } = useQuery({
    queryKey: ["outreach", "identities"],
    queryFn: () => apiClient.get<{ identities: SenderIdentity[] }>("/outreach/identities"),
  });

  const { data: templatesData } = useQuery({
    queryKey: ["outreach", "templates"],
    queryFn: () => apiClient.get<{ templates: Template[] }>("/outreach/templates"),
  });

  const { data: leadsData, isLoading: loadingLeads } = useQuery({
    queryKey: ["leads", "list-for-campaign"],
    queryFn: () => apiClient.get<{ items: Lead[] }>("/leads?limit=200"),
  });

  const identities = identitiesData?.identities ?? [];
  const templates = templatesData?.templates ?? [];
  const allLeads = leadsData?.items ?? [];

  // Form states
  const [name, setName] = useState("");
  const [senderIdentityId, setSenderIdentityId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");

  // Delay configuration (1 min default, or custom)
  const [delayPreset, setDelayPreset] = useState<"60" | "30" | "120" | "300" | "custom">("60");
  const [customDelaySeconds, setCustomDelaySeconds] = useState("90");
  const [submittingAction, setSubmittingAction] = useState<"draft" | "launch" | null>(null);

  // Selected lead IDs
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => {
    return new Set(preselectedLeadIds);
  });
  const [leadSearch, setLeadSearch] = useState("");
  const [onlyWithEmail, setOnlyWithEmail] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Category summary & counts
  const categorySummary = useMemo(() => {
    const map: Record<string, { total: number; withEmail: number; selected: number }> = {};

    allLeads.forEach((lead) => {
      const cat = lead.category?.trim() || "Uncategorized";
      const email = lead.email || lead.enrichment?.find((e) => e.field === "email")?.value;
      if (!map[cat]) {
        map[cat] = { total: 0, withEmail: 0, selected: 0 };
      }
      map[cat].total += 1;
      if (email) {
        map[cat].withEmail += 1;
        if (selectedLeadIds.has(lead.id)) {
          map[cat].selected += 1;
        }
      }
    });

    return Object.entries(map)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([category, stats]) => ({
        category,
        ...stats,
      }));
  }, [allLeads, selectedLeadIds]);

  // Auto-select first identity when loaded
  if (!senderIdentityId && identities.length > 0) {
    setSenderIdentityId(identities[0].id);
  }

  // Handle template selection
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      setSubject(tmpl.subject);
      setBodyHtml(tmpl.bodyHtml);
      if (!name) setName(`${tmpl.name} Campaign`);
    }
  };

  // Filtered leads
  const filteredLeads = useMemo(() => {
    return allLeads.filter((lead) => {
      const email = lead.email || lead.enrichment?.find((e) => e.field === "email")?.value;
      if (onlyWithEmail && !email) return false;
      const cat = lead.category?.trim() || "Uncategorized";
      if (selectedCategory !== "all" && cat.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }
      if (!leadSearch.trim()) return true;
      const query = leadSearch.toLowerCase();
      return (
        lead.name.toLowerCase().includes(query) ||
        (email && email.toLowerCase().includes(query)) ||
        (lead.category && lead.category.toLowerCase().includes(query))
      );
    });
  }, [allLeads, onlyWithEmail, selectedCategory, leadSearch]);

  // Group filtered leads by category
  const groupedLeads = useMemo(() => {
    const groups: Record<string, typeof filteredLeads> = {};
    filteredLeads.forEach((lead) => {
      const cat = lead.category?.trim() || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(lead);
    });
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [filteredLeads]);

  const effectiveDelaySeconds =
    delayPreset === "custom"
      ? Math.max(5, parseInt(customDelaySeconds, 10) || 60)
      : parseInt(delayPreset, 10);

  // Select all visible leads with email
  const handleSelectAllVisible = () => {
    const next = new Set(selectedLeadIds);
    filteredLeads.forEach((l) => {
      const email = l.email || l.enrichment?.find((e) => e.field === "email")?.value;
      if (email) next.add(l.id);
    });
    setSelectedLeadIds(next);
  };

  const handleDeselectAll = () => {
    setSelectedLeadIds(new Set());
  };

  const toggleLead = (id: string) => {
    const next = new Set(selectedLeadIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeadIds(next);
  };

  const toggleCategorySelection = (categoryName: string) => {
    const catLeadsWithEmail = filteredLeads.filter((l) => {
      const cat = l.category?.trim() || "Uncategorized";
      const email = l.email || l.enrichment?.find((e) => e.field === "email")?.value;
      return cat.toLowerCase() === categoryName.toLowerCase() && Boolean(email);
    });

    if (catLeadsWithEmail.length === 0) return;

    const next = new Set(selectedLeadIds);
    const allSelected = catLeadsWithEmail.every((l) => next.has(l.id));

    if (allSelected) {
      catLeadsWithEmail.forEach((l) => next.delete(l.id));
    } else {
      catLeadsWithEmail.forEach((l) => next.add(l.id));
    }
    setSelectedLeadIds(next);
  };

  const toggleCollapseCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const insertMergeTag = (tag: string) => {
    setBodyHtml((prev) => `${prev} {{${tag}}}`);
  };

  // Create Campaign Mutation
  const createMutation = useMutation({
    mutationFn: (autoLaunch: boolean) => {
      if (!name.trim()) throw new Error("Please enter a campaign name.");
      if (!senderIdentityId) throw new Error("Please select a sender identity.");
      if (!subject.trim()) throw new Error("Please enter an email subject line.");
      if (!bodyHtml.trim()) throw new Error("Please enter email body content.");
      if (selectedLeadIds.size === 0) {
        throw new Error("Please select at least 1 lead with a valid email address.");
      }

      // Verify that at least one of the selected leads has an email address
      const hasEmailLead = Array.from(selectedLeadIds).some((id) => {
        const lead = allLeads.find((l) => l.id === id);
        if (!lead) return true; // trust preselected/custom lead
        const email = lead.email || lead.enrichment?.find((e) => e.field === "email")?.value;
        return Boolean(email && email.includes("@"));
      });
      if (!hasEmailLead) {
        throw new Error("None of the selected leads have a valid email address. Please enrich them first or select leads with emails.");
      }

      return campaignsApi.create({
        name: name.trim(),
        senderIdentityId,
        templateId: selectedTemplateId || undefined,
        subject: subject.trim(),
        bodyHtml,
        delaySeconds: effectiveDelaySeconds,
        leadIds: Array.from(selectedLeadIds),
        autoLaunch,
      });
    },
    onSuccess: (data, autoLaunch) => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(
        autoLaunch
          ? `Campaign launched! Sending ${data.enrolledCount} emails with ${effectiveDelaySeconds}s delay.`
          : `Campaign saved as draft with ${data.enrolledCount} enrolled leads.`
      );
      onSuccess(data.campaign.id);
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create campaign.");
    },
    onSettled: () => {
      setSubmittingAction(null);
    },
  });

  // Calculate runtime
  const totalEnrolled = selectedLeadIds.size;
  const estimatedDurationMinutes = Math.round((totalEnrolled * effectiveDelaySeconds) / 60);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-xl border bg-background shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/20">
          <div>
            <h2 className="text-base font-semibold">Create Email Campaign</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Phase 3 Outreach Engine · Automated sending with delay control
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Section 1: Campaign Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              1. Campaign Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  className="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. Austin Dental Practice Mini-Audits"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Sender Identity *
                </label>
                {loadingIdentities ? (
                  <div className="h-9 bg-muted rounded animate-pulse" />
                ) : identities.length === 0 ? (
                  <p className="text-xs text-destructive mt-2">
                    No sender identities found. Please add one in the Identities tab first.
                  </p>
                ) : (
                  <select
                    className="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={senderIdentityId}
                    onChange={(e) => setSenderIdentityId(e.target.value)}
                  >
                    {identities.map((id) => (
                      <option key={id.id} value={id.id}>
                        {id.displayName} ({id.emailAddress}) — Cap: {id.dailySendCap}/day
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Template & Email Content */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Email Message
              </h3>
              {templates.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Load Template:</span>
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    value={selectedTemplateId}
                    onChange={(e) => handleSelectTemplate(e.target.value)}
                  >
                    <option value="">Select a template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Subject Line *
              </label>
              <input
                type="text"
                className="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Quick observation about {{business_name}}'s website"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Email Body (HTML / Markdown) *
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">Merge tags:</span>
                  {["business_name", "first_name", "website", "city"].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertMergeTag(tag)}
                      className="px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary text-[10px] font-mono transition-colors"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={6}
                className="w-full rounded border bg-background p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                placeholder="Hi {{first_name}},\n\nI was looking through {{business_name}}'s website..."
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
              />
            </div>
          </div>

          {/* Section 3: Automated Sending Delay Settings (User Core Requirement) */}
          <div className="space-y-3 rounded-xl border bg-muted/15 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  3. Automated Sending Delay
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Interval between each outgoing email to maintain inbox deliverability and prevent spam flagging.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tabular-nums">
                ⏱ {effectiveDelaySeconds}s delay
              </span>
            </div>

            {/* Delay Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              {[
                { id: "60", label: "1 min (Recommended)", subtitle: "60 seconds" },
                { id: "30", label: "30 sec", subtitle: "Fast pacing" },
                { id: "120", label: "2 mins", subtitle: "Moderate pacing" },
                { id: "300", label: "5 mins", subtitle: "Conservative" },
                { id: "custom", label: "Custom", subtitle: "Set exact time" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDelayPreset(opt.id as typeof delayPreset)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    delayPreset === opt.id
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "border-border bg-background hover:bg-muted text-foreground/80"
                  }`}
                >
                  <p className="text-xs leading-tight">{opt.label}</p>
                  <p
                    className={`text-[10px] mt-0.5 ${
                      delayPreset === opt.id ? "text-primary-foreground/80" : "text-muted-foreground"
                    }`}
                  >
                    {opt.subtitle}
                  </p>
                </button>
              ))}
            </div>

            {/* Custom Delay Input */}
            {delayPreset === "custom" && (
              <div className="flex items-center gap-2 pt-2">
                <label className="text-xs text-muted-foreground">Custom Delay:</label>
                <input
                  type="number"
                  min="5"
                  max="86400"
                  className="w-24 rounded border bg-background px-2.5 py-1.5 text-xs font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
                  value={customDelaySeconds}
                  onChange={(e) => setCustomDelaySeconds(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">seconds between emails</span>
              </div>
            )}

            {/* Live estimation banner */}
            <div className="flex items-center justify-between text-xs pt-1 px-1 text-muted-foreground border-t">
              <span>
                Selected Audience: <strong>{totalEnrolled} leads</strong>
              </span>
              <span>
                Estimated Duration:{" "}
                <strong className="text-foreground">
                  {totalEnrolled > 0
                    ? `~${estimatedDurationMinutes} minute${estimatedDurationMinutes !== 1 ? "s" : ""}`
                    : "0 minutes"}
                </strong>
              </span>
            </div>
          </div>

          {/* Section 4: Lead Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                4. Audience Selection ({selectedLeadIds.size} selected)
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Select All with Email
                </button>
                <span className="text-muted-foreground/40">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                className="flex-1 rounded border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Search leads by name, email, category…"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
              />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={onlyWithEmail}
                  onChange={(e) => setOnlyWithEmail(e.target.checked)}
                  className="rounded border"
                />
                Has email only
              </label>
            </div>

            {/* Category Filter Pills */}
            {categorySummary.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-medium">Filter & Select by Category:</span>
                  {selectedCategory !== "all" && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory("all")}
                      className="text-primary hover:underline font-medium"
                    >
                      Show All Categories
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("all")}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-colors border ${
                      selectedCategory === "all"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    All Categories ({allLeads.length})
                  </button>
                  {categorySummary.map(({ category, total, selected }) => {
                    const isSelectedCat =
                      selectedCategory.toLowerCase() === category.toLowerCase();
                    const hasSelected = selected > 0;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() =>
                          setSelectedCategory(isSelectedCat ? "all" : category)
                        }
                        className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-colors border flex items-center gap-1 ${
                          isSelectedCat
                            ? "bg-primary text-primary-foreground border-primary"
                            : hasSelected
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "bg-background hover:bg-muted border-border text-muted-foreground"
                        }`}
                      >
                        <span>{getCategoryIcon(category)}</span>
                        <span>{formatCategory(category)}</span>
                        <span className="opacity-75 text-[10px]">
                          ({hasSelected ? `${selected}/` : ""}{total})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Lead list container grouped by Category */}
            <div className="rounded-lg border max-h-72 overflow-y-auto divide-y divide-border">
              {loadingLeads ? (
                <p className="text-xs text-muted-foreground p-4 text-center">Loading leads…</p>
              ) : groupedLeads.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center">
                  No matching leads found. Run discovery or import leads into your pipeline first.
                </p>
              ) : (
                groupedLeads.map(([category, leadsInGroup]) => {
                  const isCollapsed = collapsedCategories.has(category);
                  const leadsWithEmailInCat = leadsInGroup.filter((l) => {
                    return Boolean(
                      l.email || l.enrichment?.find((e) => e.field === "email")?.value
                    );
                  });
                  const selectedInCat = leadsWithEmailInCat.filter((l) =>
                    selectedLeadIds.has(l.id)
                  ).length;

                  return (
                    <div key={category} className="divide-y divide-border/60">
                      <CategoryHeader
                        category={category}
                        totalCount={leadsInGroup.length}
                        withEmailCount={leadsWithEmailInCat.length}
                        selectedCount={selectedInCat}
                        isCollapsed={isCollapsed}
                        onToggleCollapse={() => toggleCollapseCategory(category)}
                        onToggleSelect={() => toggleCategorySelection(category)}
                      />

                      {!isCollapsed &&
                        leadsInGroup.map((lead) => {
                          const email =
                            lead.email ||
                            lead.enrichment?.find((e) => e.field === "email")?.value;
                          const isChecked = selectedLeadIds.has(lead.id);

                          return (
                            <div
                              key={lead.id}
                              onClick={() => email && toggleLead(lead.id)}
                              className={`flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer ${
                                isChecked
                                  ? "bg-primary/5"
                                  : email
                                  ? "hover:bg-muted/60"
                                  : "opacity-40 cursor-not-allowed"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-4">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={!email}
                                  onChange={() => email && toggleLead(lead.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded border cursor-pointer"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-foreground truncate">
                                    {lead.name}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {lead.category ? formatCategory(lead.category) : "Business"}{" "}
                                    · {lead.website?.replace(/^https?:\/\//, "") || "No site"}
                                  </p>
                                </div>
                              </div>

                              <div className="text-right shrink-0 ml-3">
                                {email ? (
                                  <span className="font-mono text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded">
                                    {email}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground italic">
                                    No email (enrich first)
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t shrink-0 bg-muted/10">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSubmittingAction("draft");
                createMutation.mutate(false);
              }}
              disabled={createMutation.isPending || selectedLeadIds.size === 0}
              className="rounded border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {submittingAction === "draft" && createMutation.isPending ? "Saving Draft…" : "Save as Draft"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSubmittingAction("launch");
                createMutation.mutate(true);
              }}
              disabled={createMutation.isPending || selectedLeadIds.size === 0}
              className="rounded bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-xs flex items-center gap-1.5"
            >
              {submittingAction === "launch" && createMutation.isPending ? "Launching…" : "Launch Campaign Now 🚀"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
