import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, Mail, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/crm/email-leads")({
  head: () => ({
    meta: [
      { title: "Novos leads de email · CRM · PSA Hub" },
      { name: "description", content: "Rever leads criados a partir de emails com a etiqueta CRM." },
      { property: "og:title", content: "Novos leads de email · PSA Hub" },
      { property: "og:description", content: "Rever leads criados a partir de emails com a etiqueta CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmailLeadsPage,
});

const FIELDS = [
  "contact_name", "email", "phone", "company", "role", "project_type",
  "location", "size", "budget", "timing", "how_found",
] as const;

type Status = "pending" | "confirmed" | "discarded";
type Draft = {
  id: string;
  kind: string;
  thread_id: string;
  subject: string | null;
  from_address: string | null;
  received_at: string | null;
  attachment_names: string[];
  extracted: Record<string, string | null>;
  summary: string | null;
  suggested_next_action: string | null;
  suggested_next_action_date: string | null;
  status: string;
  model_error: string | null;
  result_opportunity_id: string | null;
  matched_opportunity_id: string | null;
  contact: { id: string; primeiro_nome: string; apelido: string | null } | null;
  company: { id: string; nome: string } | null;
  opportunity: { id: string; name: string } | null;
};

function EmailLeadsPage() {
  const { t } = useTranslation("crm");
  const [status, setStatus] = useState<Status>("pending");
  const { data = [], isLoading } = useQuery({
    queryKey: ["crm-email-lead-drafts", status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_email_lead_drafts")
        .select(
          "id, kind, thread_id, subject, from_address, received_at, attachment_names, extracted, summary, suggested_next_action, suggested_next_action_date, status, model_error, result_opportunity_id, matched_opportunity_id, contact:contacts(id, primeiro_nome, apelido), company:companies(id, nome), opportunity:crm_opportunities!crm_email_lead_drafts_matched_opportunity_id_fkey(id, name)",
        )
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Draft[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("emailLeads.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("emailLeads.subtitle")}</p>
        </div>
        <div className="flex gap-1">
          {(["pending", "confirmed", "discarded"] as Status[]).map((s) => (
            <Button key={s} size="sm" variant={s === status ? "default" : "outline"} onClick={() => setStatus(s)}>
              {t(`emailLeads.statusFilter.${s}`)}
            </Button>
          ))}
        </div>
      </div>
      {isLoading ? null : data.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("emailLeads.empty")}</CardContent></Card>
      ) : (
        data.map((d) => <DraftCard key={d.id} draft={d} />)
      )}
    </div>
  );
}

function DraftCard({ draft }: { draft: Draft }) {
  const { t } = useTranslation("crm");
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const pending = draft.status === "pending";
  const editable = pending && isAdmin;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFields(Object.fromEntries(FIELDS.map((f) => [f, draft.extracted?.[f] ?? ""])));
    setSummary(draft.summary ?? "");
    setNextAction(draft.suggested_next_action ?? "");
    setNextDate(draft.suggested_next_action_date ?? "");
  }, [draft]);

  const save = async () => {
    const extracted = Object.fromEntries(FIELDS.map((f) => [f, fields[f]?.trim() || null]));
    const { error } = await supabase
      .from("crm_email_lead_drafts")
      .update({
        extracted,
        summary: summary.trim() || null,
        suggested_next_action: nextAction.trim() || null,
        suggested_next_action_date: nextDate || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);
    if (error) throw error;
  };

  const run = async (action: "save" | "confirm" | "discard") => {
    setBusy(true);
    try {
      if (action !== "discard") await save();
      if (action === "confirm") {
        const { error } = await supabase.rpc("crm_email_lead_confirm", { p_draft: draft.id });
        if (error) throw error;
      } else if (action === "discard") {
        const { error } = await supabase.rpc("crm_email_lead_discard", { p_draft: draft.id });
        if (error) throw error;
      }
      toast.success(t(`emailLeads.${action === "save" ? "saved" : action === "confirm" ? "confirmed" : "discarded"}`));
      qc.invalidateQueries({ queryKey: ["crm-email-lead-drafts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const oppId = draft.result_opportunity_id ?? draft.matched_opportunity_id;
  const gmailUrl = `https://mail.google.com/mail/u/?authuser=luis@pedrasilva.com#all/${draft.thread_id}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" />
              {draft.subject || "—"}
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              {t("emailLeads.from")}: {draft.from_address ?? "—"}
              {draft.received_at ? ` · ${new Date(draft.received_at).toLocaleString()}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={draft.kind === "reply" ? "secondary" : "default"}>
              {t(draft.kind === "reply" ? "emailLeads.kindReply" : "emailLeads.kindLead")}
            </Badge>
            <Button asChild size="sm" variant="ghost">
              <a href={gmailUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-4 w-4" />
                {t("emailLeads.openGmail")}
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft.model_error && <p className="text-sm text-destructive">{t("emailLeads.modelError")}</p>}
        <div className="space-y-1">
          <Label>{t("emailLeads.summary")}</Label>
          <Textarea rows={2} value={summary} disabled={!editable} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f} className="space-y-1">
              <Label className="text-xs">{t(`emailLeads.fields.${f}`)}</Label>
              <Input
                value={fields[f] ?? ""}
                disabled={!editable}
                onChange={(e) => setFields((s) => ({ ...s, [f]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">{t("emailLeads.matchedContact")}</div>
            {draft.contact ? `${draft.contact.primeiro_nome} ${draft.contact.apelido ?? ""}` : t("emailLeads.noMatch")}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("emailLeads.matchedCompany")}</div>
            {draft.company ? (
              <Link to="/crm/companies/$companyId" params={{ companyId: draft.company.id }} className="underline">
                {draft.company.nome}
              </Link>
            ) : (
              t("emailLeads.noMatch")
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("emailLeads.matchedOpportunity")}</div>
            {oppId ? (
              <Link to="/crm/opportunities/$opportunityId" params={{ opportunityId: oppId }} className="underline">
                {draft.opportunity?.name ?? t("emailLeads.openOpportunity")}
              </Link>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <div className="space-y-1">
            <Label className="text-xs">{t("emailLeads.nextAction")}</Label>
            <Input value={nextAction} disabled={!editable} onChange={(e) => setNextAction(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("emailLeads.nextActionDate")}</Label>
            <Input type="date" value={nextDate} disabled={!editable} onChange={(e) => setNextDate(e.target.value)} />
          </div>
        </div>
        {draft.attachment_names.length > 0 && (
          <div className="text-sm">
            <div className="text-xs text-muted-foreground">{t("emailLeads.attachments")}</div>
            <div className="flex flex-wrap gap-2 pt-1">
              {draft.attachment_names.map((n, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs">
                  <Paperclip className="h-3 w-3" />
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
        {pending && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {isAdmin ? (
              <>
                <Button disabled={busy} onClick={() => run("confirm")}>{t("emailLeads.confirm")}</Button>
                <Button disabled={busy} variant="outline" onClick={() => run("save")}>{t("emailLeads.save")}</Button>
                <Button disabled={busy} variant="ghost" onClick={() => run("discard")}>{t("emailLeads.discard")}</Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{t("emailLeads.adminOnly")}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
