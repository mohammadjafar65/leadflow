import { create } from "zustand";
import type { Lead, PipelineStage } from "@/types/lead";

interface LeadsFilterState {
  stage?: PipelineStage;
  category?: string;
  categories: string[];
  scoreMin?: number;
  scoreMax?: number;
  tags: string[];
  searchQuery: string;
}

interface LeadsUiState {
  view: "kanban" | "list" | "map";
  density: "comfortable" | "compact";
  selectedLeadIds: Set<string>;
  filters: LeadsFilterState;

  setView: (v: LeadsUiState["view"]) => void;
  toggleDensity: () => void;
  setSearchQuery: (q: string) => void;
  setStageFilter: (s?: PipelineStage) => void;
  setCategoryFilter: (c?: string) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
}

/**
 * UI/filter state only — server data itself is owned by React Query
 * (see src/api/leads.ts + a useLeads hook), never duplicated here.
 * Keeps this store small and avoids the two-sources-of-truth problem
 * common in lead-management dashboards with heavy filtering.
 */
export const useLeadsStore = create<LeadsUiState>((set) => ({
  view: "kanban",
  density: "comfortable",
  selectedLeadIds: new Set(),
  filters: { categories: [], tags: [], searchQuery: "" },

  setView: (view) => set({ view }),
  toggleDensity: () =>
    set((s) => ({ density: s.density === "comfortable" ? "compact" : "comfortable" })),
  setSearchQuery: (searchQuery) =>
    set((s) => ({ filters: { ...s.filters, searchQuery } })),
  setStageFilter: (stage) =>
    set((s) => ({ filters: { ...s.filters, stage } })),
  setCategoryFilter: (category) =>
    set((s) => ({ filters: { ...s.filters, category } })),
  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selectedLeadIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { selectedLeadIds: next };
    }),
  clearSelection: () => set({ selectedLeadIds: new Set() }),
}));

export function scoreColor(lead: Lead): "success" | "warning" | "destructive" {
  if (lead.score >= 70) return "success";
  if (lead.score >= 40) return "warning";
  return "destructive";
}
