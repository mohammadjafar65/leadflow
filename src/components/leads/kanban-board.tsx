import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Lead, PipelineStage } from "@/types/lead";
import { ScoreRing } from "./score-ring";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: "new_lead", label: "New Lead" },
  { id: "contacted", label: "Contacted" },
  { id: "responded", label: "Responded" },
  { id: "qualified", label: "Qualified" },
  { id: "closed", label: "Closed" },
  { id: "archived", label: "Archived" },
];

function LeadCard({
  lead,
  onClick,
  selected,
  onToggleSelect,
}: {
  lead: Lead;
  onClick?: (lead: Lead) => void;
  selected?: boolean;
  onToggleSelect?: (leadId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`p-3 mb-2 cursor-grab active:cursor-grabbing active:scale-[1.02] active:shadow-lg transition-all ${
        isDragging ? "opacity-50" : ""
      } ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-sm" : ""}`}
      onClick={(e) => {
        // Only trigger click if it wasn't a drag
        if (!isDragging) {
          e.stopPropagation();
          onClick?.(lead);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {onToggleSelect && (
            <div
              className="pt-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={Boolean(selected)}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(lead.id);
                }}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                aria-label={`Select ${lead.name}`}
              />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate text-foreground">{lead.name}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [lead.name, lead.address].filter(Boolean).join(", ")
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-rose-600 transition-colors p-0.5 shrink-0"
                title={`Open "${lead.name}" on Google Maps (opens in new tab)`}
                aria-label={`Open ${lead.name} on Google Maps`}
              >
                <MapPin className="w-3 h-3 text-rose-500 hover:scale-110 transition-transform" />
              </a>
            </div>
            {lead.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [lead.name, lead.address].filter(Boolean).join(", ")
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] text-muted-foreground hover:text-primary hover:underline truncate mt-0.5 block"
                title={`Open on Google Maps: ${lead.address}`}
              >
                {lead.address}
              </a>
            )}
            {lead.category && <Badge variant="outline" className="mt-1 text-[10px]">{lead.category}</Badge>}
          </div>
        </div>
        <ScoreRing lead={lead} size={32} />
      </div>
      {lead.phoneE164 && (
        <p className="text-[11px] text-muted-foreground mt-1.5">{lead.phoneE164}</p>
      )}
      {(lead.email || lead.enrichment?.find((e) => e.field === "email")?.value) && (
        <p className="text-[11px] text-primary truncate mt-0.5">
          ✉ {lead.email ?? lead.enrichment?.find((e) => e.field === "email")?.value}
        </p>
      )}
    </Card>
  );
}

export function KanbanBoard({
  leadsByStage,
  onStageChange,
  onLeadClick,
  selectedIds,
  onToggleSelect,
}: {
  leadsByStage: Record<PipelineStage, Lead[]>;
  onStageChange: (leadId: string, stage: PipelineStage) => void;
  onLeadClick?: (lead: Lead) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (leadId: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const targetStage = over.data.current?.stage as PipelineStage | undefined;
    if (targetStage) onStageChange(active.id as string, targetStage);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const leads = leadsByStage[stage.id] ?? [];
          return (
            <div key={stage.id} className="w-72 shrink-0">
              <div className="sticky top-0 bg-background z-10 flex items-center justify-between py-2 border-b mb-2">
                <h3 className="text-sm font-semibold">{stage.label}</h3>
                <Badge variant="secondary">{leads.length}</Badge>
              </div>
              <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                {leads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onClick={onLeadClick}
                    selected={selectedIds?.has(lead.id)}
                    onToggleSelect={onToggleSelect}
                  />
                ))}
              </SortableContext>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
