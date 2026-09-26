import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { leadsApi } from "@/api/leads";
import type { Lead, PipelineStage } from "@/types/lead";
import { toast } from "sonner";

// ─── Query Keys ────────────────────────────────────────────────────────────

export const LEADS_KEYS = {
  all: ["leads"] as const,
  list: (filters: LeadsQueryFilters) => ["leads", "list", filters] as const,
  detail: (id: string) => ["leads", "detail", id] as const,
};

// ─── Types ─────────────────────────────────────────────────────────────────

export interface LeadsQueryFilters {
  stage?: PipelineStage;
  category?: string;
  scoreMin?: number;
  scoreMax?: number;
  tag?: string;
  q?: string;
  limit?: number;
}

// ─── useLeads — infinite cursor-paginated list ─────────────────────────────

export function useLeads(filters: LeadsQueryFilters = {}) {
  return useInfiniteQuery({
    queryKey: LEADS_KEYS.list(filters),
    queryFn: async ({ pageParam }) => {
      const result = await leadsApi.list({
        cursor: pageParam as string | undefined,
        limit: filters.limit ?? 100,
        stage: filters.stage,
        category: filters.category,
        q: filters.q,
        scoreMin:filters.scoreMin,scoreMax:filters.scoreMax,tag:filters.tag,
      });
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

/**
 * Flattens all pages into a single array of leads, deduplicated by id.
 * Useful for Kanban/list views that need all loaded leads at once.
 */
export function flattenLeads(
  data: ReturnType<typeof useLeads>["data"],
): Lead[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: Lead[] = [];
  for (const page of data.pages) {
    for (const lead of page.items) {
      if (!seen.has(lead.id)) {
        seen.add(lead.id);
        out.push(lead);
      }
    }
  }
  return out;
}

/** Groups flattened leads into a stage→leads map for the Kanban board. */
export function groupByStage(leads: Lead[]): Record<PipelineStage, Lead[]> {
  const groups: Record<PipelineStage, Lead[]> = {
    new_lead: [],
    contacted: [],
    responded: [],
    qualified: [],
    closed: [],
    archived: [],
  };
  for (const lead of leads) {
    const stage = lead.stage as PipelineStage;
    if (stage in groups) groups[stage].push(lead);
  }
  return groups;
}

// ─── useLead — single lead detail ─────────────────────────────────────────

export function useLead(id: string) {
  return useQuery({
    queryKey: LEADS_KEYS.detail(id),
    queryFn: async () => {
      const result = await leadsApi.get(id);
      // The API returns { lead: Lead } but leads.ts's get() is typed as `Lead`
      // Handle both shapes gracefully.
      return (result as unknown as { lead: Lead }).lead ?? (result as Lead);
    },
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

// ─── useUpdateStage — optimistic stage mutation ────────────────────────────

export function useUpdateStage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: PipelineStage }) =>
      leadsApi.updateStage(id, stage),

    onMutate: async ({ id, stage }) => {
      // Cancel any in-flight refetches for all lead lists
      await qc.cancelQueries({ queryKey: LEADS_KEYS.all });

      // Snapshot all cached list pages for rollback
      const snapshot = qc.getQueriesData({ queryKey: LEADS_KEYS.all });

      // Optimistically update every list page that contains this lead
      qc.setQueriesData(
        { queryKey: LEADS_KEYS.all },
        (old: { pages?: { items: Lead[] }[] } | undefined) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((l) =>
                l.id === id ? { ...l, stage } : l,
              ),
            })),
          };
        },
      );

      return { snapshot };
    },

    onError: (_err, _vars, context) => {
      // Roll back optimistic update
      if (context?.snapshot) {
        for (const [key, data] of context.snapshot) {
          qc.setQueryData(key, data);
        }
      }
      toast.error("Failed to move lead — changes reverted");
    },

    onSuccess: (_data, { stage }) => {
      toast.success(`Lead moved to ${stage.replace("_", " ")}`);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: LEADS_KEYS.all });
    },
  });
}

// ─── useExtractLeads — trigger a scrape job ───────────────────────────────

import type { LeadSearchParams } from "@/types/lead";

export function useExtractLeads() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      params,
      idempotencyKey,
    }: {
      params: LeadSearchParams;
      idempotencyKey: string;
    }) => leadsApi.startExtraction(params, idempotencyKey),

    onSuccess: () => {
      // Invalidate leads queries so new leads appear after the job completes
      qc.invalidateQueries({ queryKey: LEADS_KEYS.all });
    },
  });
}

// ─── useDeleteLead — hard delete a lead ────────────────────────────────────

export function useDeleteLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => leadsApi.delete(id),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: LEADS_KEYS.all });
      const snapshot = qc.getQueriesData({ queryKey: LEADS_KEYS.all });

      // Optimistically remove the lead from all cached list pages
      qc.setQueriesData(
        { queryKey: LEADS_KEYS.all },
        (old: { pages?: { items: Lead[] }[] } | undefined) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((l) => l.id !== id),
            })),
          };
        },
      );

      return { snapshot };
    },

    onError: (_err, _id, context) => {
      if (context?.snapshot) {
        for (const [key, data] of context.snapshot) {
          qc.setQueryData(key, data);
        }
      }
      toast.error("Failed to delete lead.");
    },

    onSuccess: () => {
      toast.success("Lead deleted.");
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: LEADS_KEYS.all });
    },
  });
}

// ─── useBatchDeleteLeads — bulk hard delete ─────────────────────────────────

export function useBatchDeleteLeads() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => leadsApi.batchDelete(ids),

    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: LEADS_KEYS.all });
      const snapshot = qc.getQueriesData({ queryKey: LEADS_KEYS.all });
      const idSet = new Set(ids);

      qc.setQueriesData(
        { queryKey: LEADS_KEYS.all },
        (old: { pages?: { items: Lead[] }[] } | undefined) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((l) => !idSet.has(l.id)),
            })),
          };
        },
      );

      return { snapshot };
    },

    onError: (_err, _ids, context) => {
      if (context?.snapshot) {
        for (const [key, data] of context.snapshot) {
          qc.setQueryData(key, data);
        }
      }
      toast.error("Failed to delete leads.");
    },

    onSuccess: (data) => {
      toast.success(`Deleted ${data.deletedCount} lead${data.deletedCount !== 1 ? "s" : ""}.`);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: LEADS_KEYS.all });
    },
  });
}

// ─── useBatchUpdateStage — bulk update stage ────────────────────────────────

export function useBatchUpdateStage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, stage }: { ids: string[]; stage: PipelineStage }) =>
      leadsApi.batchUpdateStage(ids, stage),

    onMutate: async ({ ids, stage }) => {
      await qc.cancelQueries({ queryKey: LEADS_KEYS.all });
      const snapshot = qc.getQueriesData({ queryKey: LEADS_KEYS.all });
      const idSet = new Set(ids);

      qc.setQueriesData(
        { queryKey: LEADS_KEYS.all },
        (old: { pages?: { items: Lead[] }[] } | undefined) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((l) => (idSet.has(l.id) ? { ...l, stage } : l)),
            })),
          };
        },
      );

      return { snapshot };
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        for (const [key, data] of context.snapshot) {
          qc.setQueryData(key, data);
        }
      }
      toast.error("Failed to update leads stage.");
    },

    onSuccess: (data, { stage }) => {
      toast.success(
        `Moved ${data.updatedCount} lead${data.updatedCount !== 1 ? "s" : ""} to ${stage.replace("_", " ")}.`,
      );
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: LEADS_KEYS.all });
    },
  });
}
