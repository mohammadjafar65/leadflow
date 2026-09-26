import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Trash2,
  Download,
  ArrowRightCircle,
  CheckSquare,
  X,
  Plus,
  TrendingUp,
  Users,
  Target,
  CheckCircle2,
} from "lucide-react";
import { KanbanBoard } from "@/components/leads/kanban-board";
import { LeadListView } from "@/components/leads/lead-list-view";
import { FilterBar } from "@/components/leads/filter-bar";
import { LeadDetailDrawer } from "@/components/leads/lead-detail-drawer";
import {
  useLeads,
  useUpdateStage,
  useDeleteLead,
  useBatchDeleteLeads,
  useBatchUpdateStage,
  flattenLeads,
  groupByStage,
  LEADS_KEYS,
} from "@/hooks/use-leads";
import { useLeadsStore } from "@/store/leads-store";
import type { Lead, PipelineStage } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STAGE_OPTIONS: { id: PipelineStage; label: string }[] = [
  { id: "new_lead", label: "New Lead" },
  { id: "contacted", label: "Contacted" },
  { id: "responded", label: "Responded" },
  { id: "qualified", label: "Qualified" },
  { id: "closed", label: "Closed" },
  { id: "archived", label: "Archived" },
];

export function PipelinePage() {
  const { filters, view } = useLeadsStore();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    isFetching,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useLeads({
    stage: filters.stage,
    category: filters.category,
    q: filters.searchQuery || undefined,
    limit: 100,
  });

  const updateStage = useUpdateStage();
  const deleteLead = useDeleteLead();
  const batchDelete = useBatchDeleteLeads();
  const batchStage = useBatchUpdateStage();
  const qc = useQueryClient();

  const leads = flattenLeads(data);
  const totalCount = leads.length;
  const leadsByStage = groupByStage(leads);

  function handleStageChange(leadId: string, stage: PipelineStage) {
    updateStage.mutate(
      { id: leadId, stage },
      {
        onError: () => {
          void qc.invalidateQueries({ queryKey: LEADS_KEYS.all });
        },
      },
    );
  }

  function handleLeadClick(lead: Lead) {
    setSelectedLeadId(lead.id);
  }

  function handleDeleteLead(leadId: string) {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    deleteLead.mutate(leadId, {
      onSuccess: () => {
        setSelectedLeadIds((prev) => {
          const next = new Set(prev);
          next.delete(leadId);
          return next;
        });
      },
    });
  }

  function handleToggleSelect(leadId: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }

  function handleToggleSelectAll() {
    if (leads.length === 0) return;
    const allSelected = leads.every((l) => selectedLeadIds.has(l.id));
    if (allSelected) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map((l) => l.id)));
    }
  }

  function handleClearSelection() {
    setSelectedLeadIds(new Set());
  }

  function handleBatchDelete() {
    const count = selectedLeadIds.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} selected lead${count !== 1 ? "s" : ""}? This cannot be undone.`)) {
      return;
    }
    batchDelete.mutate(Array.from(selectedLeadIds), {
      onSuccess: () => {
        setSelectedLeadIds(new Set());
      },
    });
  }

  function handleBatchStageChange(stage: PipelineStage) {
    const count = selectedLeadIds.size;
    if (count === 0) return;
    batchStage.mutate(
      { ids: Array.from(selectedLeadIds), stage },
      {
        onSuccess: () => {
          setSelectedLeadIds(new Set());
        },
      },
    );
  }

  function handleExportCsv() {
    const selectedLeads = leads.filter((l) => selectedLeadIds.has(l.id));
    if (selectedLeads.length === 0) return;

    const headers = [
      "Name",
      "Stage",
      "Category",
      "Score",
      "Phone",
      "Email",
      "Website",
      "Address",
      "Rating",
      "Reviews",
    ];

    const rows = selectedLeads.map((l) => [
      `"${(l.name || "").replace(/"/g, '""')}"`,
      `"${(l.stage || "").replace(/"/g, '""')}"`,
      `"${(l.category || "").replace(/"/g, '""')}"`,
      l.score != null ? String(l.score) : "",
      `"${(l.phoneE164 || "").replace(/"/g, '""')}"`,
      `"${(l.email || l.enrichment?.find((e) => e.field === "email")?.value || "").replace(/"/g, '""')}"`,
      `"${(l.website || "").replace(/"/g, '""')}"`,
      `"${(l.address || "").replace(/"/g, '""')}"`,
      l.rating != null ? String(l.rating) : "",
      l.reviewCount != null ? String(l.reviewCount) : "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `leadflow-leads-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const selectedCount = selectedLeadIds.size;
  const newCount = leadsByStage.new_lead?.length ?? 0;
  const qualifiedCount = leadsByStage.qualified?.length ?? 0;
  const closedCount = leadsByStage.closed?.length ?? 0;

  return (
    <div className="flex flex-col h-full bg-background text-foreground relative">
      {/* Top Bar */}
      <div className="border-b border-border bg-card px-8 py-5 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto w-full">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Sales Pipeline</h1>
              <Badge variant="outline" className="text-xs font-semibold">
                {isLoading ? "Loading…" : `${totalCount.toLocaleString()} Leads`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Drag-and-drop leads across stages, filter by industry, and trigger outreach sequences.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link to="/discovery">
              <Button size="sm" className="text-xs font-bold gap-1.5 shadow-sm">
                <Plus className="h-3.5 w-3.5" />
                <span>Find New Leads</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Pipeline Summary Mini Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 max-w-7xl mx-auto w-full">
          <div className="rounded-xl border border-border bg-background p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Total In Pipeline</p>
              <p className="text-sm font-bold text-foreground">{totalCount}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">New Leads</p>
              <p className="text-sm font-bold text-foreground">{newCount}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Qualified</p>
              <p className="text-sm font-bold text-foreground">{qualifiedCount}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Closed Deals</p>
              <p className="text-sm font-bold text-foreground">{closedCount}</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 max-w-7xl mx-auto w-full">
          <FilterBar
            totalCount={totalCount}
            onRefresh={() => void refetch()}
            isRefreshing={isFetching && !isLoading}
          />
        </div>

        {/* Bulk Actions Banner */}
        {selectedCount > 0 && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs max-w-7xl mx-auto w-full animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <CheckSquare className="w-4 h-4" />
                <span>{selectedCount} selected</span>
              </span>
              <span className="text-xs text-muted-foreground">|</span>
              <button
                onClick={handleToggleSelectAll}
                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                {selectedCount === leads.length ? "Deselect All" : `Select All (${leads.length})`}
              </button>
              <button
                onClick={handleClearSelection}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-1"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5 inline" />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Move to Stage dropdown */}
              <div className="flex items-center gap-1.5">
                <ArrowRightCircle className="w-3.5 h-3.5 text-muted-foreground" />
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBatchStageChange(e.target.value as PipelineStage);
                      e.target.value = "";
                    }
                  }}
                  disabled={batchStage.isPending}
                  className="rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer disabled:opacity-50 text-foreground"
                >
                  <option value="" disabled>
                    Move to Stage…
                  </option>
                  {STAGE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Export Selected */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="text-xs font-semibold gap-1 h-7"
                title="Export selected leads as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </Button>

              {/* Delete Selected */}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBatchDelete}
                disabled={batchDelete.isPending}
                className="text-xs font-semibold gap-1 h-7"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {batchDelete.isPending ? "Deleting…" : `Delete (${selectedCount})`}
                </span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Main Board / List View Content */}
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto h-full">
          {leads.length === 0 && !isLoading ? (
            <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center bg-card max-w-lg mx-auto space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No leads in pipeline yet</h3>
              <p className="text-xs text-muted-foreground">
                Run your first search from the Discovery page to populate your pipeline with verified businesses.
              </p>
              <Link to="/discovery">
                <Button size="sm" className="font-bold text-xs mt-2">
                  Launch Lead Discovery →
                </Button>
              </Link>
            </div>
          ) : view === "kanban" ? (
            <KanbanBoard
              leadsByStage={leadsByStage}
              onStageChange={handleStageChange}
              onLeadClick={handleLeadClick}
              selectedIds={selectedLeadIds}
              onToggleSelect={handleToggleSelect}
            />
          ) : (
            <LeadListView
              leads={leads}
              onStageChange={handleStageChange}
              onLeadClick={handleLeadClick}
              onDelete={handleDeleteLead}
              isLoading={isLoading}
              hasNextPage={hasNextPage}
              onLoadMore={() => void fetchNextPage()}
              selectedIds={selectedLeadIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
            />
          )}
        </div>
      </div>

      {/* Lead Detail Drawer */}
      <LeadDetailDrawer
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onStageChange={handleStageChange}
      />
    </div>
  );
}