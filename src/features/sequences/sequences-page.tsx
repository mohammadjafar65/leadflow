import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import type { Sequence, SequenceStep, SequenceStepKind } from "@/types/outreach";
import type { Template, SenderIdentity } from "@/types/outreach";
import {
  GitBranch,
  Plus,
  Trash2,
  Clock,
  Mail,
  HelpCircle,
  Split,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ─── API helpers ─────────────────────────────────────────────────────────────

const sequencesApi = {
  list: () => apiClient.get<{ sequences: Sequence[] }>("/sequences"),
  create: (data: { name: string; industryVertical?: string }) =>
    apiClient.post<{ sequence: Sequence }>("/sequences", data),
  delete: (id: string) => apiClient.delete<void>(`/sequences/${id}`),
  addStep: (seqId: string, step: Omit<SequenceStep, "id">) =>
    apiClient.post<{ step: SequenceStep }>(`/sequences/${seqId}/steps`, step),
  deleteStep: (seqId: string, stepId: string) =>
    apiClient.delete<void>(`/sequences/${seqId}/steps/${stepId}`),
  enroll: (seqId: string, data: { leadIds: string[]; senderIdentityId: string }) =>
    apiClient.post<{ enrolled: number; skipped: number }>(`/sequences/${seqId}/enroll`, data),
  getStats: (seqId: string) =>
    apiClient.get<{ stats: Record<string, number> }>(`/sequences/${seqId}/stats`),
};

// ─── Step config metadata ──────────────────────────────────────────────────

const STEP_KIND_INFO: Record<
  SequenceStepKind,
  { label: string; icon: React.ElementType; color: string }
> = {
  delay: { label: "Wait Delay", icon: Clock, color: "text-blue-500 bg-blue-500/10" },
  send_email: { label: "Send Email", icon: Mail, color: "text-emerald-500 bg-emerald-500/10" },
  condition: { label: "Check Condition", icon: HelpCircle, color: "text-amber-500 bg-amber-500/10" },
  branch: { label: "Split Branch", icon: Split, color: "text-purple-500 bg-purple-500/10" },
};

export function SequencesPage() {
  const qc = useQueryClient();
  const [selectedSeqId, setSelectedSeqId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVertical, setNewVertical] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sequences"],
    queryFn: () => sequencesApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      sequencesApi.create({ name: newName, industryVertical: newVertical || undefined }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["sequences"] });
      setShowNew(false);
      setSelectedSeqId(res.sequence.id);
      setNewName("");
      setNewVertical("");
      toast.success("Sequence created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sequencesApi.delete(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ["sequences"] });
      if (selectedSeqId === id) setSelectedSeqId(null);
      toast.success("Sequence deleted");
    },
  });

  const sequences = data?.sequences ?? [];
  const selectedSeq = sequences.find((s) => s.id === selectedSeqId) ?? (sequences[0] || null);

  return (
    <div className="flex min-h-full flex-col lg:flex-row bg-background text-foreground">
      {/* Sidebar — sequence list */}
      <div className="w-full lg:w-72 shrink-0 border-b lg:border-r border-border bg-card flex flex-col">
        <div className="px-5 py-5 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold text-foreground">Email Sequences</h1>
            <p className="text-[11px] text-muted-foreground">Multi-touch automated drip</p>
          </div>
          <Button
            onClick={() => setShowNew(true)}
            size="sm"
            className="text-xs font-bold gap-1 h-8"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New</span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {isLoading ? (
            <p className="text-xs text-muted-foreground p-3 animate-pulse">Loading sequences…</p>
          ) : sequences.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-xl mt-4">
              No sequences created yet. Click &quot;+ New&quot; to build your first email sequence.
            </div>
          ) : (
            sequences.map((seq) => (
              <button
                key={seq.id}
                onClick={() => {
                  setSelectedSeqId(seq.id);
                  setShowNew(false);
                }}
                className={`w-full text-left rounded-xl p-3.5 text-sm transition-all border ${
                  selectedSeq?.id === seq.id
                    ? "bg-primary/5 text-foreground border-primary/40 shadow-xs"
                    : "border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-xs truncate text-foreground">{seq.name}</p>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {seq.steps.length} steps
                  </Badge>
                </div>
                {seq.industryVertical && (
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">
                    📍 {seq.industryVertical}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-3xl mx-auto">
          {showNew ? (
            <Card className="shadow-sm border-border">
              <CardHeader>
                <CardTitle className="text-base font-bold">Create New Sequence</CardTitle>
                <CardDescription className="text-xs">
                  Automate multiple email touches with scheduled delays and conditional checks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                    Sequence Name
                  </label>
                  <Input
                    placeholder="e.g. Law Firm 3-Touch Pitch, Dental SEO Outreach"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createMutation.mutate()}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                    Industry Vertical (Optional)
                  </label>
                  <Input
                    placeholder="e.g. Legal, Dental, Hospitality"
                    value={newVertical}
                    onChange={(e) => setNewVertical(e.target.value)}
                  />
                </div>
  
              <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending || !newName.trim()}
                    size="sm"
                    className="font-bold text-xs"
                  >
                    {createMutation.isPending ? "Creating…" : "Save Sequence"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowNew(false)}
                    size="sm"
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : selectedSeq ? (
            <SequenceDetail
              key={selectedSeq.id}
              sequence={selectedSeq}
              onDelete={() => {
                if (confirm("Delete this sequence?")) deleteMutation.mutate(selectedSeq.id);
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-2xl border border-dashed border-border p-12 max-w-sm bg-card space-y-3">
                <GitBranch className="h-10 w-10 text-muted-foreground mx-auto" />
                <h3 className="text-base font-bold text-foreground">No sequence selected</h3>
                <p className="text-xs text-muted-foreground">
                  Select an existing sequence from the sidebar or create a new multi-step drip flow.
                </p>
                <Button onClick={() => setShowNew(true)} size="sm" className="font-bold text-xs">
                  Create First Sequence
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sequence Detail / Flow Builder ──────────────────────────────────────────

function SequenceDetail({
  sequence,
  onDelete,
}: {
  sequence: Sequence;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [addingStep, setAddingStep] = useState(false);
  const [condition,setCondition]=useState('opened');
  const [onTrue,setOnTrue]=useState('');
  const [onFalse,setOnFalse]=useState('');
  const control=useMutation({mutationFn:(status:string)=>apiClient.patch<{updated:number}>(`/sequences/${sequence.id}/enrollments`,{status}),onSuccess:r=>{toast.success(r.updated+' enrollments updated');void qc.invalidateQueries({queryKey:['sequences']});},onError:(e:Error)=>toast.error(e.message)});
  const [stepKind, setStepKind] = useState<SequenceStepKind>("delay");
  const [delayHours, setDelayHours] = useState("24");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  // Fetch templates for the dropdown
  const { data: templatesData } = useQuery({
    queryKey: ["outreach", "templates"],
    queryFn: () => apiClient.get<{ templates: Template[] }>("/outreach/templates"),
  });
  const templates = templatesData?.templates ?? [];

  // Fetch sequence stats
  const { data: statsData } = useQuery({
    queryKey: ["sequences", sequence.id, "stats"],
    queryFn: () => sequencesApi.getStats(sequence.id),
  });
  const stats = statsData?.stats ?? {};

  const addStepMutation = useMutation({
    mutationFn: () => {
      const config: Record<string, unknown> =
        stepKind === "delay"
          ? { delay_hours: Number(delayHours) }
          : stepKind === "send_email"
          ? { template_id: selectedTemplateId }
          : {condition,on_true:Number(onTrue),on_false:Number(onFalse)};
      return sequencesApi.addStep(sequence.id, {
        order: Math.max(0,...sequence.steps.map(s=>s.order)) + 1,
        kind: stepKind,
        config,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sequences"] });
      setAddingStep(false);
      setSelectedTemplateId("");
      toast.success("Sequence step added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) => sequencesApi.deleteStep(sequence.id, stepId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sequences"] });
      toast.success("Step removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">{[['paused','Pause enrollments'],['active','Resume eligible'],['cancelled','Cancel enrollments']].map(([status,label])=><Button key={status} variant="outline" size="sm" disabled={control.isPending} onClick={()=>control.mutate(status)}>{label}</Button>)}</div>
      <p className="text-xs text-muted-foreground">A delivery already accepted by the provider cannot be cancelled. Unconfirmed deliveries remain paused for review.</p>
      {/* Top Header Card */}
      <Card className="border-border shadow-xs">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">{sequence.name}</h2>
                {sequence.industryVertical && (
                  <Badge variant="secondary" className="text-xs">
                    {sequence.industryVertical}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {sequence.steps.length} touchpoint{sequence.steps.length !== 1 ? "s" : ""} in this automated flow.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowEnrollModal(true)}
                size="sm"
                className="text-xs font-bold gap-1.5 shadow-sm"
              >
                <Users className="h-3.5 w-3.5" />
                <span>Enroll Leads</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                <span>Delete</span>
              </Button>
            </div>
          </div>

          {/* Stats Bar */}
          {Object.keys(stats).length > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-lg font-bold text-foreground">{stats["enrolled"] ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Total Enrolled</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-lg font-bold text-emerald-600">{stats["completed"] ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Completed</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-lg font-bold text-blue-600">{stats["active"] ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">In Progress</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual Step Timeline */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Sequence Workflow
        </h3>

        {sequence.steps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center bg-card space-y-2">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto opacity-70" />
            <p className="text-sm font-semibold text-foreground">No steps in this sequence</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Add your first action such as an initial email touch or a delay before sending.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sequence.steps
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((step, i) => {
                const info = STEP_KIND_INFO[step.kind];
                const config = step.config as Record<string, unknown>;
                const Icon = info.icon;
                const template = templates.find((t) => t.id === config.template_id);

                return (
                  <div key={step.id} className="relative flex items-start gap-4">
                    {/* Circle Step Number */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shadow-xs">
                        {i + 1}
                      </div>
                      {i < sequence.steps.length - 1 && (
                        <div className="w-0.5 h-12 bg-border my-1" />
                      )}
                    </div>

                    {/* Step Card */}
                    <Card className="flex-1 shadow-2xs border-border">
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-lg shrink-0 ${info.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground">{info.label}</p>
                            {step.kind === "delay" && (
                              <p className="text-xs text-muted-foreground">
                                Wait {String(config.delay_hours ?? 24)} hours
                                {config.timezone_aware ? " (business hours)" : ""}
                              </p>
                            )}
                            {step.kind === "send_email" && (
                              <p className="text-xs text-muted-foreground truncate">
                                Template:{" "}
                                <strong>{template ? template.name : "Custom Email Template"}</strong>
                              </p>
                            )}
                            {(step.kind === "condition" || step.kind === "branch") && (
                              <p className="text-xs text-muted-foreground truncate">
                                Custom condition logic
                              </p>
                            )}
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteStepMutation.mutate(step.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                          title="Remove Step"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
          </div>
        )}

        {/* Add Step Form / Button */}
        {addingStep ? (
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">Add Step to Sequence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Action Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(STEP_KIND_INFO) as SequenceStepKind[]).map((k) => {
                    const info = STEP_KIND_INFO[k];
                    const Icon = info.icon;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setStepKind(k)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                          stepKind === k
                            ? "bg-primary text-primary-foreground border-primary shadow-xs"
                            : "bg-card text-foreground hover:bg-muted border-border"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {stepKind === "delay" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                    Delay Duration (Hours)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    className="w-36 text-sm"
                    value={delayHours}
                    onChange={(e) => setDelayHours(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {Math.round(Number(delayHours) / 24)} day{Math.round(Number(delayHours) / 24) !== 1 ? "s" : ""} · Elapsed time; nights and weekends are included.
                  </p>
                </div>
              )}

              {stepKind === "send_email" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                    Select Email Template
                  </label>
                  {templates.length === 0 ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No templates found. Create a template in the Outreach Engine first.
                    </p>
                  ) : (
                    <select
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                    >
                      <option value="">Choose an email template…</option>
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.subject})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {(stepKind==='condition'||stepKind==='branch')&&<div className="grid gap-3 sm:grid-cols-3"><label className="text-xs">Event<select className="field mt-2" value={condition} onChange={e=>setCondition(e.target.value)}><option value="opened">Opened</option><option value="clicked">Clicked</option></select></label><label className="text-xs">If observed, go to step<Input type="number" min={1} value={onTrue} onChange={e=>setOnTrue(e.target.value)}/></label><label className="text-xs">Otherwise, go to step<Input type="number" min={1} value={onFalse} onChange={e=>setOnFalse(e.target.value)}/></label><p className="text-xs text-muted-foreground sm:col-span-3">Destinations must be later steps and exist before enrollment. Replies stop further sending.</p></div>}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => addStepMutation.mutate()}
                  disabled={
                    addStepMutation.isPending ||
                    (stepKind === "send_email" && !selectedTemplateId)
                  }
                  size="sm"
                  className="font-bold text-xs"
                >
                  {addStepMutation.isPending ? "Adding…" : "Add Step to Sequence"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setAddingStep(false)}
                  size="sm"
                  className="text-xs"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button
            variant="outline"
            onClick={() => setAddingStep(true)}
            className="w-full border-dashed text-xs font-semibold h-10 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Next Step</span>
          </Button>
        )}
      </div>

      {/* Enroll Leads Modal */}
      {showEnrollModal && (
        <EnrollLeadsModal
          sequenceId={sequence.id}
          sequenceName={sequence.name}
          onClose={() => setShowEnrollModal(false)}
        />
      )}
    </div>
  );
}

// ─── Enroll Leads Modal ──────────────────────────────────────────────────────

function EnrollLeadsModal({
  sequenceId,
  sequenceName,
  onClose,
}: {
  sequenceId: string;
  sequenceName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedSenderId, setSelectedSenderId] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  // Fetch identities
  const { data: idData } = useQuery({
    queryKey: ["outreach", "identities"],
    queryFn: () => apiClient.get<{ identities: SenderIdentity[] }>("/outreach/identities"),
  });
  const identities = idData?.identities ?? [];

  // Fetch leads
  const { data: leadsData } = useQuery({
    queryKey: ["leads", "for_enrollment"],
    queryFn: () => apiClient.get<{ leads: Array<{ id: string; name: string; email?: string }> }>("/leads?limit=100"),
  });
  const leads = leadsData?.leads ?? [];
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const handleEnroll = async () => {
    if (!selectedSenderId) {
      toast.error("Please select a sender identity (mailbox).");
      return;
    }
    const idsToEnroll = selectedLeadIds.length > 0 ? selectedLeadIds : leads.map((l) => l.id);
    if (idsToEnroll.length === 0) {
      toast.error("No leads available to enroll.");
      return;
    }

    setEnrolling(true);
    try {
      const res = await sequencesApi.enroll(sequenceId, {
        leadIds: idsToEnroll,
        senderIdentityId: selectedSenderId,
      });
      toast.success(`Enrolled ${res.enrolled} leads in "${sequenceName}"!`);
      void qc.invalidateQueries({ queryKey: ["sequences", sequenceId, "stats"] });
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to enroll leads");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <Card className="max-w-md w-full border-border shadow-2xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground">Enroll Leads in Sequence</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sequence: <strong>{sequenceName}</strong>
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Sender Identity (Mailbox)
          </label>
          {identities.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No mailboxes configured. Add a sender identity in the Outreach Engine first.
            </p>
          ) : (
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedSenderId}
              onChange={(e) => setSelectedSenderId(e.target.value)}
            >
              <option value="">Select a sender email…</option>
              {identities.map((id) => (
                <option key={id.id} value={id.id}>
                  {id.displayName} ({id.emailAddress})
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-muted-foreground">Select Leads</label>
            <div className="flex gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setSelectedLeadIds(leads.map((l) => l.id))}
                className="text-primary hover:underline font-medium"
              >
                Select All ({leads.length})
              </button>
              {selectedLeadIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedLeadIds([])}
                  className="text-muted-foreground hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border/60 bg-muted/20">
            {leads.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">No pipeline leads found.</p>
            ) : (
              leads.map((lead) => {
                const isSelected = selectedLeadIds.includes(lead.id);
                return (
                  <label
                    key={lead.id}
                    className="flex items-center gap-2 p-2 text-xs hover:bg-muted/40 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setSelectedLeadIds((prev) =>
                          prev.includes(lead.id)
                            ? prev.filter((id) => id !== lead.id)
                            : [...prev, lead.id]
                        );
                      }}
                      className="rounded border-input text-primary focus:ring-ring"
                    />
                    <span className="font-medium text-foreground truncate flex-1">{lead.name}</span>
                    {lead.email && (
                      <span className="text-[10px] text-muted-foreground truncate">{lead.email}</span>
                    )}
                  </label>
                );
              })
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {selectedLeadIds.length > 0
              ? `${selectedLeadIds.length} lead${selectedLeadIds.length !== 1 ? "s" : ""} selected for enrollment.`
              : `All ${leads.length} leads will be enrolled by default.`}
          </p>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleEnroll}
            disabled={enrolling || identities.length === 0 || leads.length === 0}
            className="text-xs font-bold"
          >
            {enrolling ? "Enrolling…" : "Enroll Now"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
