import { useState, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLeadsStore } from "@/store/leads-store";
import { apiClient } from "@/lib/api-client";
import type { PipelineStage } from "@/types/lead";

const STAGE_OPTIONS: { value: PipelineStage | ""; label: string }[] = [
  { value: "", label: "All Stages" },
  { value: "new_lead", label: "New Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "responded", label: "Responded" },
  { value: "qualified", label: "Qualified" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
];

interface FilterBarProps {
  totalCount?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function FilterBar({ totalCount, onRefresh, isRefreshing }: FilterBarProps) {
  const { filters, view, setView, setSearchQuery, setStageFilter, setCategoryFilter } = useLeadsStore();
  const [localSearch, setLocalSearch] = useState(filters.searchQuery);
  const searchId = useId();

  // Fetch distinct categories for the filter dropdown
  const { data: categoriesData } = useQuery({
    queryKey: ["leads", "categories"],
    queryFn: () => apiClient.get<{ categories: string[] }>("/leads/categories"),
    staleTime: 60_000,
    retry: false,
  });
  const categories = categoriesData?.categories ?? [];

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      setSearchQuery(localSearch.trim());
    }
  }

  function handleSearchBlur() {
    setSearchQuery(localSearch.trim());
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/* Search */}
      <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-sm">
        <label htmlFor={searchId} className="sr-only">Search leads</label>
        <div className="relative w-full">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            id={searchId}
            type="text"
            className="w-full rounded border bg-background pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Search leads…"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onBlur={handleSearchBlur}
          />
        </div>
      </div>

      {/* Stage filter */}
      <select
        className="rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        value={filters.stage ?? ""}
        onChange={(e) => {
          const v = e.target.value as PipelineStage | "";
          setStageFilter(v === "" ? undefined : v);
        }}
      >
        {STAGE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Category filter */}
      {categories.length > 0 && (
        <select
          className="rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary max-w-[180px]"
          value={filters.category ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setCategoryFilter(v === "" ? undefined : v);
          }}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      )}

      {/* Lead count */}
      {totalCount !== undefined && (
        <span className="text-xs text-muted-foreground">
          {totalCount.toLocaleString()} lead{totalCount !== 1 ? "s" : ""}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* View toggle */}
      <div className="flex items-center rounded border overflow-hidden">
        {(["kanban", "list"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              view === v
                ? "bg-primary text-primary-foreground"
                : "bg-background text-foreground/70 hover:bg-muted"
            }`}
          >
            {v === "kanban" ? "Kanban" : "List"}
          </button>
        ))}
      </div>

      {/* Refresh */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="rounded border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          title="Refresh leads"
        >
          {isRefreshing ? (
            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
