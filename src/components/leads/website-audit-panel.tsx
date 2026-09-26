import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { leadsApi } from "@/api/leads";
import type { Lead, AuditFinding } from "@/types/lead";
import { Badge } from "@/components/ui/badge";

interface WebsiteAuditPanelProps {
  lead: Lead;
  onNavigateToOutreach?: () => void;
}

export function WebsiteAuditPanel({ lead, onNavigateToOutreach }: WebsiteAuditPanelProps) {
  const qc = useQueryClient();
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"findings" | "email" | "pillars">("findings");

  const { data, isLoading } = useQuery({
    queryKey: ["leads", lead.id, "audit"],
    queryFn: () => leadsApi.getAudit(lead.id),
    staleTime: 60_000,
  });

  const audit = data?.audit;

  const runMutation = useMutation({
    mutationFn: () => leadsApi.runAudit(lead.id),
    onSuccess: (res) => {
      qc.setQueryData(["leads", lead.id, "audit"], res);
      void qc.invalidateQueries({ queryKey: ["leads", lead.id, "audit"] });
      toast.success("MZI Studio Website Audit completed!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to audit website");
    },
  });

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(label);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  if (!lead.website) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
        <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg">
          🌐
        </div>
        <h4 className="text-sm font-semibold">No Website Registered</h4>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          This lead doesn&apos;t have a website URL attached. Add a website to run an 8-point audit and generate personalized MZI Studio outreach.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-12 text-center space-y-3">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground">Checking existing audit report…</p>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="rounded-xl border bg-card/60 p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🎯</span>
              <h3 className="text-sm font-semibold">MZI Studio Website Audit Engine</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Audit <strong>{lead.website}</strong> across 8 technical & UX pillars to discover high-value conversion opportunities.
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px]">MZI Outreach</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-500 font-bold">✓</span> 8-Pillar Scoring
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-500 font-bold">✓</span> Tech Stack Detection
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-500 font-bold">✓</span> Top 3–5 Business Findings
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-500 font-bold">✓</span> Personalized Cold Email
          </div>
        </div>

        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="w-full py-2 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
        >
          {runMutation.isPending ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              <span>Auditing Website (Performance, UX, Stack)…</span>
            </>
          ) : (
            <>
              <span>⚡ Run 8-Point Website Audit</span>
            </>
          )}
        </button>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400";
    if (score >= 60) return "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400";
    return "text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400";
  };

  const mailtoHref = `mailto:${lead.email || ""}?subject=${encodeURIComponent(audit.generatedEmail?.subject || "")}&body=${encodeURIComponent(audit.generatedEmail?.bodyText || "")}`;

  const isParked = Boolean(
    audit.isParkedOrDead ||
    
    audit.techStack?.some((t) => t.toLowerCase().includes("parked") || t.toLowerCase().includes("dead")),
  );

  return (
    <div className="space-y-4">
      {/* Parked / Inactive Website Warning Banner */}
      {isParked && (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
              Parked / Inactive Domain Detected
            </h4>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            The domain <strong className="font-semibold">{lead.website}</strong> resolves to a parked holding page ({audit.parkedProvider || "GoDaddy / Registrar"}) with no active business website. Standard Track 1 UX audit is bypassed, and a tailored <strong>Track 2 &quot;No Website / Dead Domain&quot;</strong> outreach strategy and cold email have been generated below.
          </p>
        </div>
      )}

      {/* Top Header Card */}
      <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">Audit Overview</h3>
              {isParked ? (
                <Badge className="bg-amber-500/15 text-amber-800 border-amber-300 dark:text-amber-300 text-[10px]">
                  Track 2: Parked Domain Opportunity
                </Badge>
              ) : audit.isIcp ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-300 text-[10px]">
                  Qualified ICP Prospect
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Borderline Prospect
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs" title={lead.website}>
              {lead.website}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className={`px-2.5 py-1 rounded-lg border text-center font-bold text-sm ${isParked ? "text-amber-700 bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300" : getScoreColor(audit.overallScore)}`}>
              {audit.overallScore}<span className="text-[10px] font-normal opacity-75">{isParked ? " (Parked)" : "/100 HTML"}</span>
            </div>
            <button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              title="Re-run website audit"
              className="p-1.5 rounded-lg border hover:bg-muted text-muted-foreground hover:text-foreground text-xs transition-colors disabled:opacity-50"
            >
              {runMutation.isPending ? "⏳" : "🔄"}
            </button>
          </div>
        </div>

        {/* ICP Reason & Qualification */}
        <div className="text-xs bg-muted/40 rounded-lg p-2.5 border flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-primary font-medium">ICP Fit ({audit.qualificationScore}/100):</span>
            <span className="text-muted-foreground truncate">{audit.icpReason}</span>
          </div>
        </div>

        {/* Tech Stack Badges */}
        {audit.techStack && audit.techStack.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-muted-foreground">Status / Stack:</span>
            {audit.techStack.map((tech) => (
              <Badge
                key={tech}
                variant={isParked ? "outline" : "secondary"}
                className={`text-[10px] font-normal px-1.5 py-0 ${isParked ? "border-amber-400 text-amber-800 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/30" : ""}`}
              >
                {tech}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex rounded-lg border bg-muted/50 p-0.5 text-xs font-medium">
        <button
          onClick={() => setActiveView("findings")}
          className={`flex-1 py-1.5 rounded-md transition-all ${
            activeView === "findings"
              ? "bg-background shadow-xs text-foreground font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {isParked ? "Domain Impact" : "Findings"} ({audit.findings?.length || 0})
        </button>
        <button
          onClick={() => setActiveView("email")}
          className={`flex-1 py-1.5 rounded-md transition-all ${
            activeView === "email"
              ? "bg-background shadow-xs text-foreground font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {isParked ? "Track 2 Cold Email" : "Cold Email Draft"}
        </button>
        <button
          onClick={() => setActiveView("pillars")}
          className={`flex-1 py-1.5 rounded-md transition-all ${
            activeView === "pillars"
              ? "bg-background shadow-xs text-foreground font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {isParked ? "Pillar Status" : "8 Pillars"}
        </button>
      </div>

      {/* View 1: Top 3-5 Findings */}
      {activeView === "findings" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Top Findings & Business Impact
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {audit.findings?.length || 0} Key Opportunities
            </span>
          </div>

          <div className="space-y-2.5">
            {audit.findings?.map((finding: AuditFinding, idx: number) => (
              <div key={idx} className="rounded-lg border bg-card p-3.5 space-y-2 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-primary">#{idx + 1}</span>
                    <Badge variant="outline" className="text-[10px] font-medium py-0">
                      {finding.area}
                    </Badge>
                    {finding.severity === "high" && (
                      <span className="inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        High Impact
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-semibold text-foreground">{finding.title}</h5>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {finding.technicalCause}
                  </p>
                </div>

                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2 text-xs">
                  <span className="font-semibold text-amber-800 dark:text-amber-300">Business Impact: </span>
                  <span className="text-foreground/90">{finding.businessImpact}</span>
                </div>

                <div className="text-[11px] text-muted-foreground pt-0.5">
                  <span className="font-medium text-foreground">Recommended fix: </span>
                  {finding.solution}
                </div>
              </div>
            ))}
          </div>

          {/* Quick email generator CTA banner */}
          <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-foreground">Ready to reach out?</p>
              <p className="text-[11px] text-muted-foreground">
                We formulated these findings into a concise cold email from Mohammad / MZI Studio.
              </p>
            </div>
            <button
              onClick={() => setActiveView("email")}
              className="shrink-0 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
            >
              View Email Draft →
            </button>
          </div>
        </div>
      )}

      {/* View 2: Personalized Cold Email */}
      {activeView === "email" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              MZI Studio Personalized Outreach
            </h4>
            <span className="text-[10px] text-muted-foreground">~130 words · High Response Rate</span>
          </div>

          {/* Subject Line */}
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Subject Line</span>
              <button
                onClick={() => copyToClipboard(audit.generatedEmail?.subject || "", "Subject")}
                className="text-[11px] text-primary hover:underline"
              >
                {copiedSection === "Subject" ? "Copied! ✓" : "Copy Subject"}
              </button>
            </div>
            <p className="text-xs font-medium text-foreground select-all">
              {audit.generatedEmail?.subject}
            </p>
          </div>

          {/* Email Body */}
          <div className="rounded-lg border bg-card p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Email Body (Preview)</span>
              <button
                onClick={() => copyToClipboard(audit.generatedEmail?.bodyText || "", "Email Body")}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                {copiedSection === "Email Body" ? "Copied! ✓" : "Copy Body Text"}
              </button>
            </div>

            <div
              className="text-xs leading-relaxed space-y-2 text-foreground/90 font-sans whitespace-pre-line"
            >
              {audit.generatedEmail?.bodyText}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                const fullEmail = `Subject: ${audit.generatedEmail?.subject}\n\n${audit.generatedEmail?.bodyText}`;
                void copyToClipboard(fullEmail, "Full Email");
              }}
              className="flex-1 py-2 px-3 rounded-lg border bg-background hover:bg-muted text-xs font-medium transition-colors text-center"
            >
              {copiedSection === "Full Email" ? "Copied to Clipboard! ✓" : "📋 Copy Full Email"}
            </button>

            {lead.email ? (
              <a
                href={mailtoHref}
                className="flex-1 py-2 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition-colors text-center shadow-xs"
              >
                ✉ Open Mail App
              </a>
            ) : (
              <button
                onClick={() => {
                  toast.info("No direct contact email found. You can copy the message and send via contact form or LinkedIn.");
                }}
                className="flex-1 py-2 px-3 rounded-lg border text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                ✉ No Email (Use Form)
              </button>
            )}

            {onNavigateToOutreach && (
              <button
                onClick={onNavigateToOutreach}
                className="py-2 px-3 rounded-lg border bg-muted/60 hover:bg-muted text-xs font-medium transition-colors text-center"
              >
                Outreach Engine →
              </button>
            )}
          </div>
        </div>
      )}

      {/* View 3: 8 Pillar Scorecards */}
      {activeView === "pillars" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              8-Point Pillar Evaluation
            </h4>
            <span className="text-[11px] text-muted-foreground">Comprehensive Technical Audit</span>
          </div>

          <div className="space-y-2">
            {Object.entries(audit.pillars || {}).map(([pillarKey, pillar]: [string, any]) => (
              <div key={pillarKey} className="rounded-lg border bg-card p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold capitalize">
                    {pillarKey.replace(/_/g, " ")}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getScoreColor(pillar.score)}`}>
                    {pillar.status === "not_measured" ? "Not measured" : pillar.score + "/100"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">{pillar.summary}</p>
                {pillar.details && pillar.details.length > 0 && (
                  <ul className="text-[10px] text-muted-foreground/80 space-y-0.5 list-disc list-inside pt-1">
                    {pillar.details.map((detail: string, i: number) => (
                      <li key={i} className="truncate">{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
