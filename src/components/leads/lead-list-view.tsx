import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import type { Lead, PipelineStage } from "@/types/lead";
import { ScoreRing } from "./score-ring";
import { Badge } from "@/components/ui/badge";
import { ProvenanceBadge } from "./provenance-badge";
import { MapPin, ExternalLink } from "lucide-react";

const STAGE_LABELS: Record<PipelineStage, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  responded: "Responded",
  qualified: "Qualified",
  closed: "Closed",
  archived: "Archived",
};

interface LeadListViewProps {
  leads: Lead[];
  onStageChange: (leadId: string, stage: PipelineStage) => void;
  onLeadClick?: (lead: Lead) => void;
  onDelete?: (leadId: string) => void;
  isLoading?: boolean;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  groupByCategory?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (leadId: string) => void;
  onToggleSelectAll?: () => void;
}

export function LeadListView({
  leads,
  onStageChange,
  onLeadClick,
  onDelete,
  isLoading,
  hasNextPage,
  onLoadMore,
  groupByCategory = true,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: LeadListViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const isAllSelected = leads.length > 0 && leads.every((l) => selectedIds?.has(l.id));
  const isSomeSelected = leads.some((l) => selectedIds?.has(l.id)) && !isAllSelected;

  const baseColumns: ColumnDef<Lead>[] = [
    ...(onToggleSelect
      ? [
          {
            id: "select",
            header: () => (
              <div
                className="flex items-center justify-center w-6"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeSelected;
                  }}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleSelectAll?.();
                  }}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  aria-label="Select all visible leads"
                />
              </div>
            ),
            cell: ({ row }: { row: { original: Lead } }) => {
              const isChecked = Boolean(selectedIds?.has(row.original.id));
              return (
                <div
                  className="flex items-center justify-center w-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSelect(row.original.id);
                    }}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                    aria-label={`Select ${row.original.name}`}
                  />
                </div>
              );
            },
            enableSorting: false,
          } as ColumnDef<Lead>,
        ]
      : []),
    {
      accessorKey: "name",
      header: "Business",
      cell: ({ row }) => {
        const lead = row.original;
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [lead.name, lead.address].filter(Boolean).join(", ")
        )}`;

        return (
          <div className="min-w-0 py-0.5">
            <div className="flex items-center gap-1.5 group/name">
              <span className="font-medium text-sm truncate max-w-[210px] text-foreground">
                {lead.name}
              </span>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center p-0.5 rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all shrink-0"
                title={`Open "${lead.name}" on Google Maps (opens in new tab)`}
                aria-label={`Open ${lead.name} on Google Maps`}
              >
                <MapPin className="w-3.5 h-3.5 text-rose-500 hover:scale-110 transition-transform" />
              </a>
            </div>

            {lead.address ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-muted-foreground hover:text-primary hover:underline truncate max-w-[220px] flex items-center gap-1 mt-0.5 group/addr"
                title={`Open on Google Maps: ${lead.address}`}
              >
                <span className="truncate">{lead.address}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover/addr:opacity-100 shrink-0 transition-opacity" />
              </a>
            ) : (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary hover:underline mt-0.5"
                title={`Search "${lead.name}" on Google Maps`}
              >
                <span className="text-[10px]">Google Maps</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
              </a>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ getValue }) => {
        const v = getValue<string | undefined>();
        return v ? <Badge variant="outline" className="text-[10px] whitespace-nowrap">{v}</Badge> : null;
      },
    },
    {
      accessorKey: "score",
      header: "Score",
      cell: ({ row }) => <ScoreRing lead={row.original} size={32} />,
      sortingFn: "basic",
    },
    {
      accessorKey: "stage",
      header: "Stage",
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <select
            value={lead.stage}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onStageChange(lead.id, e.target.value as PipelineStage)}
            className="rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            {(Object.keys(STAGE_LABELS) as PipelineStage[]).map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
        );
      },
    },
    {
      accessorKey: "phoneE164",
      header: "Phone",
      cell: ({ getValue }) => {
        const v = getValue<string | undefined>();
        return v ? (
          <a
            href={`tel:${v}`}
            className="text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {v}
          </a>
        ) : <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    {
      id: "email",
      header: "Email",
      cell: ({ row }) => {
        const email = row.original.email ?? row.original.enrichment.find((e) => e.field === "email")?.value;
        return email ? (
          <a
            href={`mailto:${email}`}
            className="text-xs text-primary font-medium hover:underline truncate max-w-[170px] block"
            onClick={(e) => e.stopPropagation()}
            title={email}
          >
            ✉ {email}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground italic">No email</span>
        );
      },
    },
    {
      accessorKey: "website",
      header: "Website",
      cell: ({ getValue }) => {
        const v = getValue<string | undefined>();
        return v ? (
          <a
            href={v}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline truncate max-w-[160px] block"
            onClick={(e) => e.stopPropagation()}
          >
            {v.replace(/^https?:\/\//, "")}
          </a>
        ) : <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    {
      id: "enrichment",
      header: "Source",
      cell: ({ row }) => {
        const uniqueSources = row.original.enrichment.filter(
          (e, i, arr) => arr.findIndex((x) => x.source === e.source) === i,
        );
        return (
          <div className="flex gap-1 flex-wrap">
            {uniqueSources.map((e) => (
              <ProvenanceBadge key={e.source} record={e} />
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "rating",
      header: "Rating",
      cell: ({ row }) => {
        const { rating, reviewCount } = row.original;
        const numRating = rating != null ? Number(rating) : NaN;
        if (isNaN(numRating)) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span className="text-xs">
            ⭐ {numRating.toFixed(1)}
            {reviewCount ? (
              <span className="text-muted-foreground ml-1">
                ({Number(reviewCount).toLocaleString()})
              </span>
            ) : null}
          </span>
        );
      },
      sortingFn: "basic",
    },
  ];

  const columns: ColumnDef<Lead>[] = onDelete
    ? [
        ...baseColumns,
        {
          id: "actions",
          header: "",
          cell: ({ row }) => (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(row.original.id);
              }}
              title="Delete lead"
              className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          ),
        },
      ]
    : baseColumns;

  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (isLoading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Loading leads…
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-sm text-muted-foreground">
        <p className="font-medium text-foreground/70">No leads found</p>
        <p className="mt-1">Try adjusting your filters or run a Discovery search.</p>
      </div>
    );
  }

  const sortedRows = table.getRowModel().rows;
  const colSpan = columns.length;

  const renderRows = () => {
    if (!groupByCategory) {
      return sortedRows.map((row) => {
        const isSelected = Boolean(selectedIds?.has(row.original.id));
        return (
          <tr
            key={row.id}
            className={`border-b last:border-0 transition-colors cursor-pointer ${
              isSelected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/30"
            }`}
            onClick={() => onLeadClick?.(row.original)}
          >
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className="px-3 py-2.5 align-middle">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        );
      });
    }

    // Build category groups preserving sort order within each group
    const groups = new Map<string, typeof sortedRows>();
    for (const row of sortedRows) {
      const cat = row.original.category ?? "Uncategorized";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(row);
    }

    const result: React.ReactNode[] = [];
    for (const [category, rows] of groups) {
      // Category header row
      result.push(
        <tr key={`group-${category}`} className="bg-muted/50 border-b">
          <td colSpan={colSpan} className="px-3 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {category}
            </span>
            <span className="ml-2 text-[11px] font-normal text-muted-foreground/60">
              {rows.length} lead{rows.length !== 1 ? "s" : ""}
            </span>
          </td>
        </tr>,
      );
      for (const row of rows) {
        const isSelected = Boolean(selectedIds?.has(row.original.id));
        result.push(
          <tr
            key={row.id}
            className={`border-b last:border-0 transition-colors cursor-pointer ${
              isSelected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/30"
            }`}
            onClick={() => onLeadClick?.(row.original)}
          >
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className="px-3 py-2.5 align-middle">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>,
        );
      }
    }
    return result;
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap select-none"
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: header.column.getCanSort() ? "pointer" : "default" }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" && " ↑"}
                    {header.column.getIsSorted() === "desc" && " ↓"}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>{renderRows()}</tbody>
        </table>
      </div>

      {(hasNextPage || isLoading) && (
        <div className="flex justify-center border-t py-3">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            {isLoading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
