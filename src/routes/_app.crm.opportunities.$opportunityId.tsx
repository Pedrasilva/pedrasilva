import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  formatEUR, OPPORTUNITY_STAGES, QUOTE_STATUSES, FEE_STRUCTURE_TYPES,
  type CrmOpportunity, type OpportunityStage, type FeeProposal, type FeeStructureType,
  type Contact, contactFullName,
} from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/opportunities/$opportunityId")({
  component: OpportunityDetail,
});

function OpportunityDetail() {
  const { t } = useTranslation("crm");
  const { opportunityId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: opp, isLoading } = useQuery({
    queryKey: ["crm_opportunity", opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_opportunities")
        .select("*, company:companies(id, nome), contact:contacts(id, primeiro_nome, apelido, titulo)")
        .eq("id", opportunityId)
        .single();
      if (error) throw error;
      return data as CrmOpportunity & {
        company: { id: string; nome: string } | null;
        contact: Pick<Contact, "id" | "primeiro_nome" | "apelido" | "titulo"> | null;
      };
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-by-company", opp?.company_id],
    queryFn: async () => {
      if (!opp?.company_id) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, primeiro_nome, apelido, titulo")
        .eq("company_id", opp.company_id)
        .order("primeiro_nome");
      if (error) throw error;
      return data as Pick<Contact, "id" | "primeiro_nome" | "apelido" | "titulo">[];
    },
    enabled: !!opp?.company_id,
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ["fee_proposals_by_opp", opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("*, account:crm_accounts(id, name)")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (FeeProposal & { account: { id: string; name: string } | null })[];
    },
  });

  const updateStage = useMutation({
    mutationFn: async (stage: OpportunityStage) => {
      const { error } = await supabase
        .from("crm_opportunities").update({ stage }).eq("id", opportunityId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("opportunities.detail.stageUpdatedToast"));
      qc.invalidateQueries({ queryKey: ["crm_opportunity", opportunityId] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateContact = useMutation({
    mutationFn: async (primary_contact_id: string | null) => {
      const { error } = await supabase
        .from("crm_opportunities").update({ primary_contact_id }).eq("id", opportunityId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("opportunities.detail.contactUpdatedToast"));
      qc.invalidateQueries({ queryKey: ["crm_opportunity", opportunityId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("crm_opportunities").delete().eq("id", opportunityId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("opportunities.detail.deletedToast"));
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      navigate({ to: "/crm/opportunities" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [quoteOpen, setQuoteOpen] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!opp) return <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>;

  const stage = OPPORTUNITY_STAGES.find((s) => s.value === opp.stage);

  return (
    <div className="space-y-6">
      <Link
        to="/crm/opportunities"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> {t("opportunities.detail.back")}
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{opp.name}</h2>
          <p className="text-sm text-muted-foreground">
            {opp.company?.nome ?? "—"}
            {opp.contact && ` · ${contactFullName(opp.contact)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs`}>
            <span className={`h-2 w-2 rounded-full ${stage?.color}`} />
            {stage ? t(`stage.${stage.value}`) : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm(t("opportunities.detail.deleteConfirm"))) remove.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">{t("opportunities.detail.overview")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">{t("common.estimatedFee").replace(" (€)", "")}</Label>
              <div className="text-lg font-semibold">{formatEUR(Number(opp.estimated_fee))}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("common.probability").replace(" (%)", "")}</Label>
              <div className="text-lg font-semibold">{opp.probability}%</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("common.expectedStart")}</Label>
              <div className="text-sm">{opp.expected_start_date ?? "—"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("common.stage")}</Label>
              <Select
                value={opp.stage}
                onValueChange={(v) => updateStage.mutate(v as OpportunityStage)}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPPORTUNITY_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{t(`stage.${s.value}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">{t("common.primaryContact")}</Label>
              <Select
                value={opp.primary_contact_id ?? "none"}
                onValueChange={(v) => updateContact.mutate(v === "none" ? null : v)}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder={t("common.noContact")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.noContact")}</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{contactFullName(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">{t("common.notes")}</Label>
              <p className="text-sm whitespace-pre-wrap">{opp.notas || "—"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("opportunities.detail.company")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {opp.company ? (
              <Link
                to="/crm/companies/$companyId"
                params={{ companyId: opp.company.id }}
                className="font-medium hover:underline"
              >
                {opp.company.nome}
              </Link>
            ) : "—"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("opportunities.detail.quotesSection")}</CardTitle>
          <Button size="sm" onClick={() => setQuoteOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t("opportunities.detail.newQuote")}
          </Button>
        </CardHeader>
        <CardContent>
          {quotes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <FileText className="h-8 w-8 opacity-50" />
              <span className="font-medium">{t("opportunities.detail.noQuotesTitle")}</span>
              <span>{t("opportunities.detail.noQuotesHint")}</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2">{t("opportunities.detail.quoteTitle")}</th>
                  <th className="px-2 py-2">{t("opportunities.detail.quoteAccount")}</th>
                  <th className="px-2 py-2">{t("opportunities.detail.quoteStructure")}</th>
                  <th className="px-2 py-2">{t("opportunities.detail.quoteStatus")}</th>
                  <th className="px-2 py-2 text-right">{t("opportunities.detail.quoteFee")}</th>
                  <th className="px-2 py-2 text-right">{t("common.notes").replace("Notes", "")}</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const status = QUOTE_STATUSES.find((s) => s.value === q.quote_status);
                  const struct = FEE_STRUCTURE_TYPES.find((s) => s.value === q.fee_structure_type);
                  return (
                    <tr key={q.id} className="border-b hover:bg-muted/30">
                      <td className="px-2 py-2">
                        <Link
                          to="/crm/quotes/$quoteId"
                          params={{ quoteId: q.id }}
                          className="font-medium hover:underline"
                        >
                          {q.titulo}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{q.account?.name ?? "—"}</td>
                      <td className="px-2 py-2 text-muted-foreground">{struct ? t(`feeStructure.${struct.value}`) : ""}</td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className={`h-2 w-2 rounded-full ${status?.color}`} />
                          {status ? t(`quoteStatus.${status.value}`) : ""}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-medium">{formatEUR(Number(q.valor))}</td>
                      <td className="px-2 py-2 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          <Link to="/crm/quotes/$quoteId" params={{ quoteId: q.id }}>
                            {t("opportunities.card.openQuote")}
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <NewQuoteDialog
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        opportunityId={opp.id}
        companyId={opp.company_id}
        defaultTitle={opp.name}
        defaultFee={Number(opp.estimated_fee)}
      />
    </div>
  );
}

function NewQuoteDialog({
  open, onClose, opportunityId, companyId, defaultTitle, defaultFee,
}: {
  open: boolean; onClose: () => void;
  opportunityId: string; companyId: string;
  defaultTitle: string; defaultFee: number;
}) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: accounts = [] } = useQuery({
    queryKey: ["crm_accounts_by_company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: open,
  });

  const [form, setForm] = useState({
    titulo: defaultTitle,
    valor: String(defaultFee || ""),
    fee_structure_type: "fixed" as FeeStructureType,
    account_id: "",
    notas: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.titulo.trim()) throw new Error(t("quotes.newQuoteDialog.errorTitle"));
      const { data, error } = await supabase
        .from("fee_proposals")
        .insert({
          titulo: form.titulo.trim(),
          opportunity_id: opportunityId,
          company_id: companyId,
          account_id: form.account_id || null,
          valor: form.valor ? Number(form.valor) : 0,
          fee_structure_type: form.fee_structure_type,
          quote_status: "draft",
          pipeline_status: "lead",
          notas: form.notas || null,
          data_proposta: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(t("quotes.newQuoteDialog.createdToast"));
      qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp", opportunityId] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      onClose();
      // Send the user straight into the quote workspace.
      navigate({ to: "/crm/quotes/$quoteId", params: { quoteId: data.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("quotes.newQuoteDialog.title")}</DialogTitle>
          <DialogDescription>{t("quotes.newQuoteDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{t("common.title")} *</Label>
            <Input
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("common.estimatedFee")}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t("common.feeStructure")}</Label>
              <Select
                value={form.fee_structure_type}
                onValueChange={(v) => setForm((f) => ({ ...f, fee_structure_type: v as FeeStructureType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FEE_STRUCTURE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{t(`feeStructure.${s.value}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t("quotes.newQuoteDialog.accountOptional")}</Label>
            <Select
              value={form.account_id || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, account_id: v === "none" ? "" : v }))}
            >
              <SelectTrigger><SelectValue placeholder={t("common.noAccount")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("quotes.newQuoteDialog.noAccountSetBefore")}</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("quotes.newQuoteDialog.noAccountsHint")}
              </p>
            )}
          </div>
          <div>
            <Label>{t("common.notes")}</Label>
            <Textarea
              rows={2}
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.titulo.trim()}
          >
            {t("quotes.newQuoteDialog.createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
