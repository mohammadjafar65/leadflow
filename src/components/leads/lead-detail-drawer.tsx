import { useState } from "react";
import { useLead } from "@/hooks/use-leads";
import { ScoreRing } from "./score-ring";
import { ProvenanceBadge } from "./provenance-badge";
import { WebsiteAuditPanel } from "./website-audit-panel";
import { Badge } from "@/components/ui/badge";
import { MapPin, ExternalLink } from "lucide-react";
import type { PipelineStage } from "@/types/lead";

const STAGE_LABELS: Record<PipelineStage, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  responded: "Responded",
  qualified: "Qualified",
  closed: "Closed",
  archived: "Archived",
};

interface LeadDetailDrawerProps {
  leadId: string | null;
  onClose: () => void;
  onStageChange: (leadId: string, stage: PipelineStage) => void;
}

export function LeadDetailDrawer({ leadId, onClose, onStageChange }: LeadDetailDrawerProps) {
  const { data: lead, isLoading } = useLead(leadId ?? "");
  const [activeTab, setActiveTab] = useState<"overview" | "audit">("overview");

  if (!leadId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className={`fixed right-0 top-0 z-50 h-full w-full ${activeTab === "audit" ? "max-w-xl" : "max-w-md"} bg-background border-l shadow-2xl flex flex-col transition-all duration-200`}>
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b">
          <div className="min-w-0 pr-4">
            {isLoading ? (
              <div className="h-5 w-40 bg-muted animate-pulse rounded" />
            ) : (
              <h2 className="text-base font-semibold truncate">{lead?.name}</h2>
            )}
            {lead?.category && (
              <Badge variant="outline" className="mt-1 text-[10px]">{lead.category}</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lead && <ScoreRing lead={lead} size={36} />}
            <button
              onClick={onClose}
              className="rounded-full p-1.5 hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b px-5 bg-muted/15">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Lead Overview
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "audit"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>Website Audit</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-primary/10 text-primary font-bold">
              MZI Outreach
            </span>
          </button>
        </div>


        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : lead ? (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {activeTab === "audit" ? (
              <WebsiteAuditPanel lead={lead} />
            ) : (
              <>
                {/* Stage */}
                <Section title="Stage">
                  <select
                    value={lead.stage}
                    onChange={(e) => onStageChange(lead.id, e.target.value as PipelineStage)}
                    className="w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {(Object.entries(STAGE_LABELS) as [PipelineStage, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Section>

                {/* Contact details */}
                <Section title="Contact">
                  <dl className="space-y-2">
                    {lead.phoneE164 && (
                      <DetailRow label="Phone">
                        <a href={`tel:${lead.phoneE164}`} className="text-primary hover:underline text-sm">
                          {lead.phoneE164}
                        </a>
                      </DetailRow>
                    )}
                    {(lead.email || lead.enrichment.find((e) => e.field === "email")?.value) && (
                      <DetailRow label="Email">
                        <a
                          href={`mailto:${lead.email ?? lead.enrichment.find((e) => e.field === "email")?.value}`}
                          className="text-primary font-medium hover:underline text-sm truncate"
                        >
                          ✉ {lead.email ?? lead.enrichment.find((e) => e.field === "email")?.value}
                        </a>
                      </DetailRow>
                    )}
                    {lead.website && (
                      <DetailRow label="Website">
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-sm truncate"
                          >
                            {lead.website.replace(/^https?:\/\//, "")}
                          </a>
                          <button
                            onClick={() => setActiveTab("audit")}
                            className="text-[11px] font-medium text-primary hover:underline shrink-0 bg-primary/10 px-2 py-0.5 rounded"
                          >
                            Audit Site →
                          </button>
                        </div>
                      </DetailRow>
                    )}
                {lead.address && (
                  <DetailRow label="Address">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground">{lead.address}</span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          [lead.name, lead.address].filter(Boolean).join(", ")
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline shrink-0 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 px-2 py-0.5 rounded transition-colors"
                        title={`Open on Google Maps (opens in new tab)`}
                      >
                        <MapPin className="w-3 h-3 text-rose-500" />
                        <span>Google Maps</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </DetailRow>
                )}
                {lead.rating != null && !isNaN(Number(lead.rating)) && (
                  <DetailRow label="Rating">
                    <span className="text-sm">
                      ⭐ {Number(lead.rating).toFixed(1)}
                      {lead.reviewCount ? ` (${Number(lead.reviewCount).toLocaleString()} reviews)` : ""}
                    </span>
                  </DetailRow>
                )}
              </dl>
            </Section>

            {/* Score breakdown */}
            {lead.scoreBreakdown && (
              <Section title="Score Breakdown">
                <div className="space-y-2">
                  {[
                    { label: "Data completeness", val: lead.scoreBreakdown.completeness, max: 25 },
                    { label: "Industry match", val: lead.scoreBreakdown.industryMatch, max: 25 },
                    { label: "Website quality", val: lead.scoreBreakdown.websiteQuality, max: 20 },
                    { label: "Engagement", val: lead.scoreBreakdown.engagement, max: 30 },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium tabular-nums">{item.val}/{item.max}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(item.val / item.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Enrichment records */}
            {lead.enrichment.length > 0 && (
              <Section title="Enrichment Records">
                <div className="space-y-2">
                  {lead.enrichment.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <ProvenanceBadge record={e} />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-muted-foreground">{e.field}: </span>
                        <span className="break-all">{e.value}</span>
                      </div>
                      <span className="text-muted-foreground/60 shrink-0">
                        {Math.round(e.confidence * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Tags */}
            {lead.tags.length > 0 && (
              <Section title="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {lead.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </Section>
            )}

            {/* Meta */}
            <Section title="Details">
              <dl className="space-y-1">
                <DetailRow label="Lead ID">
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{lead.id.slice(0, 8)}…</code>
                </DetailRow>
                <DetailRow label="Created">
                  <span className="text-sm">{new Date(lead.createdAt).toLocaleDateString()}</span>
                </DetailRow>
                <DetailRow label="Updated">
                  <span className="text-sm">{new Date(lead.updatedAt).toLocaleDateString()}</span>
                </DetailRow>
              </dl>
            </Section>
          </>
        )}
      </div>
    ) : null}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</h3>
      {children}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-xs text-muted-foreground w-20 shrink-0 pt-0.5">{label}</dt>
      <dd className="flex-1 min-w-0">{children}</dd>
    </div>
  );
}
