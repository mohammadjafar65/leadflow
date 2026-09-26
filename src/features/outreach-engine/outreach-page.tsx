import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import type { SenderIdentity, Template } from "@/types/outreach";
import { CampaignsTab } from "./campaigns-tab";
import {
  Send,
  Mail,
  FileText,
  Plus,
  Trash2,
  Variable,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ─── API helpers ─────────────────────────────────────────────────────────────

const outreachApi = {
  // Sender identities
  listIdentities: () => apiClient.get<{ identities: SenderIdentity[] }>("/outreach/identities"),
  createIdentity: (data: Partial<SenderIdentity> & { smtpPassword: string }) =>
    apiClient.post<{ identity: SenderIdentity }>("/outreach/identities", data),
  deleteIdentity: (id: string) => apiClient.delete<void>(`/outreach/identities/${id}`),
  testIdentity: (id: string) =>
    apiClient.post<{ success: boolean; error?: string }>(`/outreach/identities/${id}/test`, {}),

  // Templates
  listTemplates: () => apiClient.get<{ templates: Template[] }>("/outreach/templates"),
  createTemplate: (data: Partial<Template>) =>
    apiClient.post<{ template: Template }>("/outreach/templates", data),
  updateTemplate: (id: string, data: Partial<Template>) =>
    apiClient.patch<{ template: Template }>(`/outreach/templates/${id}`, data),
  deleteTemplate: (id: string) => apiClient.delete<void>(`/outreach/templates/${id}`),
};

// ─── Component ───────────────────────────────────────────────────────────────

type Tab = "campaigns" | "templates" | "identities";

export function OutreachPage() {
  const [tab, setTab] = useState<Tab>("campaigns");

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-card px-8 py-5 shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Outreach Engine</h1>
              <Badge variant="outline" className="text-xs font-semibold">
                Drip & Warmup Ready
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Connect custom SMTP mailboxes, draft high-converting templates with dynamic variables, and launch automated drip campaigns.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 mt-5 border-t border-border pt-3 max-w-6xl mx-auto w-full">
          <button
            onClick={() => setTab("campaigns")}
            className={`pb-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              tab === "campaigns"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Email Campaigns</span>
          </button>

          <button
            onClick={() => setTab("templates")}
            className={`pb-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              tab === "templates"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Templates</span>
          </button>

          <button
            onClick={() => setTab("identities")}
            className={`pb-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              tab === "identities"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Sender Identities (SMTP)</span>
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 md:p-8 max-w-6xl mx-auto w-full">
        {tab === "campaigns" && <CampaignsTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "identities" && <IdentitiesTab />}
      </div>
    </div>
  );
}

// ─── Identities Tab ──────────────────────────────────────────────────────────

function IdentitiesTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    emailAddress: "",
    smtpHost: "mail.privateemail.com",
    smtpPort: "465",
    smtpUsername: "",
    smtpPassword: "",
    dailySendCap: "50",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["outreach", "identities"],
    queryFn: () => outreachApi.listIdentities(),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const email = form.emailAddress.trim() || form.smtpUsername.trim();
      const display = form.displayName.trim() || email.split("@")[0] || "Outreach";
      if (!email || !form.smtpHost.trim() || !form.smtpPassword) {
        throw new Error("Please enter your email, SMTP host, and password.");
      }
      return outreachApi.createIdentity({
        ...form,
        displayName: display,
        emailAddress: email,
        smtpHost: form.smtpHost.trim(),
        smtpUsername: form.smtpUsername.trim() || email,
        smtpPort: Number(form.smtpPort) || 465,
        dailySendCap: Number(form.dailySendCap) || 50,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["outreach", "identities"] });
      setShowForm(false);
      toast.success("Sender identity created");
      setForm({
        displayName: "",
        emailAddress: "",
        smtpHost: "mail.privateemail.com",
        smtpPort: "465",
        smtpUsername: "",
        smtpPassword: "",
        dailySendCap: "50",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => outreachApi.deleteIdentity(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["outreach", "identities"] });
      toast.success("Sender identity removed");
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => outreachApi.testIdentity(id),
    onSuccess: (res) => {
      if (res.success) toast.success("SMTP handshake successful! Mailbox ready to send.");
      else toast.error(`Connection failed: ${res.error ?? "Unknown error"}`);
    },
  });

  const identities = data?.identities ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Connected Mailboxes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect your custom domain email via SMTP. All credentials are AES-256 encrypted at rest.
          </p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          size="sm"
          className="text-xs font-bold gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Mailbox</span>
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">New Sender Mailbox</CardTitle>
            <CardDescription className="text-xs">
              Supports Google Workspace, Namecheap PrivateEmail, Zoho, SendGrid, and custom SMTP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Display Name</label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="e.g. Alex from Acme"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Email Address</label>
                <Input
                  type="email"
                  value={form.emailAddress}
                  onChange={(e) => setForm((f) => ({ ...f, emailAddress: e.target.value }))}
                  placeholder="alex@yourdomain.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">SMTP Host</label>
                <Input
                  value={form.smtpHost}
                  onChange={(e) => setForm((f) => ({ ...f, smtpHost: e.target.value }))}
                  placeholder="smtp.gmail.com or mail.privateemail.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">SMTP Port</label>
                <Input
                  type="number"
                  value={form.smtpPort}
                  onChange={(e) => setForm((f) => ({ ...f, smtpPort: e.target.value }))}
                  placeholder="465 (SSL) or 587 (TLS)"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">SMTP Username</label>
                <Input
                  value={form.smtpUsername}
                  onChange={(e) => setForm((f) => ({ ...f, smtpUsername: e.target.value }))}
                  placeholder="alex@yourdomain.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">SMTP Password</label>
                <Input
                  type="password"
                  value={form.smtpPassword}
                  onChange={(e) => setForm((f) => ({ ...f, smtpPassword: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Daily Sending Cap (emails/day)
                </label>
                <Input
                  type="number"
                  value={form.dailySendCap}
                  onChange={(e) => setForm((f) => ({ ...f, dailySendCap: e.target.value }))}
                  placeholder="50"
                  className="max-w-xs"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                size="sm"
                className="font-bold text-xs"
              >
                {createMutation.isPending ? "Saving…" : "Save Mailbox"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                size="sm"
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Identity list */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground animate-pulse">Loading mailboxes…</p>
      ) : identities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card space-y-3">
          <Mail className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="text-sm font-bold text-foreground">No sender mailboxes yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Add your domain mailbox via SMTP to start delivering personalized outreach campaigns.
          </p>
          <Button onClick={() => setShowForm(true)} size="sm" className="font-bold text-xs">
            Add First Mailbox
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {identities.map((id) => (
            <Card key={id.id} className="shadow-2xs border-border">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground">{id.displayName}</p>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      Cap: {id.dailySendCap}/day
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{id.emailAddress}</p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1">
                    Host: {id.smtpHost}:{id.smtpPort}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMutation.mutate(id.id)}
                    disabled={testMutation.isPending}
                    className="text-xs font-semibold h-8"
                  >
                    Test Connection
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm("Delete this mailbox?")) deleteMutation.mutate(id.id);
                    }}
                    className="text-xs text-destructive hover:bg-destructive/10 h-8"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Templates Tab ───────────────────────────────────────────────────────────

const TEMPLATE_VARS = [
  { tag: "{{business_name}}", label: "Business Name" },
  { tag: "{{first_name}}", label: "First Name" },
  { tag: "{{city}}", label: "City" },
  { tag: "{{category}}", label: "Category" },
  { tag: "{{website}}", label: "Website" },
  { tag: "{{phone}}", label: "Phone" },
];

function TemplatesTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", bodyHtml: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["outreach", "templates"],
    queryFn: () => outreachApi.listTemplates(),
  });

  const createMutation = useMutation({
    mutationFn: () => outreachApi.createTemplate(form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["outreach", "templates"] });
      setShowNew(false);
      setForm({ name: "", subject: "", bodyHtml: "" });
      toast.success("Template created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => outreachApi.deleteTemplate(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["outreach", "templates"] });
      toast.success("Template deleted");
    },
  });

  const templates = data?.templates ?? [];

  function insertVar(v: string) {
    setForm((f) => ({ ...f, bodyHtml: f.bodyHtml + v }));
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Email Pitch Templates</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use variables like <code className="bg-muted px-1 rounded text-[11px]">{"{{business_name}}"}</code> for automated personalization.
          </p>
        </div>
        <Button
          onClick={() => {
            setShowNew(!showNew);
            setEditing(null);
          }}
          size="sm"
          className="text-xs font-bold gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Template</span>
        </Button>
      </div>

      {(showNew || editing) && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">
              {editing ? "Edit Template" : "New Outreach Template"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Template Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Web Design Audit Pitch — Dentists"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Subject Line</label>
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Quick question about {{business_name}}'s Google Maps ranking"
              />
            </div>

            {/* Variable picker */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                <Variable className="h-3 w-3" />
                <span>Insert Dynamic Variable</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARS.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertVar(v.tag)}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 font-mono text-foreground border border-border transition-colors"
                  >
                    {v.tag}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Email Body (HTML)</label>
              <textarea
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[160px]"
                value={form.bodyHtml}
                onChange={(e) => setForm((f) => ({ ...f, bodyHtml: e.target.value }))}
                placeholder="<p>Hi {{first_name}},</p><p>I noticed {{business_name}} in {{city}} is missing reviews on Google Maps...</p>"
              />
            </div>

            {/* Live Preview */}
            {form.bodyHtml && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Live Sample Preview</p>
                <div
                  className="rounded-lg border border-border p-4 text-xs bg-muted/20 max-h-40 overflow-y-auto leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: form.bodyHtml
                      .replace(/\{\{business_name\}\}/g, "Apex Dental Care")
                      .replace(/\{\{first_name\}\}/g, "Dr. Smith")
                      .replace(/\{\{city\}\}/g, "Austin")
                      .replace(/\{\{category\}\}/g, "Dental Clinic")
                      .replace(/\{\{website\}\}/g, "apexdental.com")
                      .replace(/\{\{phone\}\}/g, "+1 (512) 555-0199"),
                  }}
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.name || !form.subject || !form.bodyHtml}
                size="sm"
                className="font-bold text-xs"
              >
                {createMutation.isPending ? "Saving…" : "Save Template"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowNew(false);
                  setEditing(null);
                }}
                size="sm"
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground animate-pulse">Loading templates…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card space-y-3">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="text-sm font-bold text-foreground">No email templates created</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Create reusable templates with personalized tags to power your cold email campaigns.
          </p>
          <Button
            onClick={() => {
              setShowNew(true);
              setEditing(null);
            }}
            size="sm"
            className="font-bold text-xs"
          >
            Create First Template
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => (
            <Card key={tpl.id} className="shadow-2xs border-border">
              <CardContent className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    Subject: <strong>{tpl.subject}</strong>
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(tpl);
                      setShowNew(true);
                      setForm({ name: tpl.name, subject: tpl.subject, bodyHtml: tpl.bodyHtml });
                    }}
                    className="text-xs h-8"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm("Delete this template?")) deleteMutation.mutate(tpl.id);
                    }}
                    className="text-xs text-destructive hover:bg-destructive/10 h-8"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
