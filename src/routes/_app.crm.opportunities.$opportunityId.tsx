import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useRecordRecentlyViewed } from "@/hooks/use-recently-viewed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, FileText, Trash2, AlertTriangle, Calendar as CalendarIcon, Mail, Phone, User } from "lucide-react";
import { OpportunityActivityTimeline } from "@/components/crm/opportunity-activity-timeline";
import { OPPORTUNITY_SOURCES, type OpportunitySource } from "@/lib/crm/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  formatEUR, OPPORTUNITY_STAGES, QUOTE_STATUSES, FEE_STRUCTURE_TYPES,
  defaultQuoteTypeForCategory,
  type CrmOpportunity, type OpportunityStage, type FeeProposal, type FeeStructureType,
  type QuoteType, type QuoteCategory, type Contact, contactFullName,
} from "@/lib/crm/types";
import { Briefcase, Clock, Wrench } from "lucide-react";

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

  useRecordRecentlyViewed({
    module: "crm",
    href: `/crm/opportunities/${opportunityId}`,
    label: opp?.name ?? "",
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

  const updateField = useMutation({
    mutationFn: async (patch: Partial<{
      next_action: string | null;
      next_action_date: string | null;
      source: string | null;
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
    }>) => {
      const { error } = await supabase
        .from("crm_opportunities").update(patch).eq("id", opportunityId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_opportunity", opportunityId] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
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
  const nextActionStatus = getNextActionStatus(opp.next_action_date);

  return (
    <div className="space-y-4">
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
            {opp.company?.nome ?? t("opportunities.card.noCompany")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <span className={`h-2 w-2 rounded-full ${stage?.color}`} />
            {stage ? t(`stage.${stage.value}`) : ""}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm(t("opportunities.detail.deleteConfirm"))) remove.mutate();
            }}
            disabled={remove.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1" /> {t("common.delete")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* LEFT: summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("opportunities.detail.nextActionTitle")}</CardTitle>
            </CardHeader>
            <CardContent
              className={cn(
                "space-y-2 rounded-b-lg",
                nextActionStatus === "overdue" && "bg-destructive/10",
                nextActionStatus === "soon" && "bg-amber-500/10",
              )}
            >
              <Textarea
                rows={2}
                placeholder={t("opportunities.detail.nextActionPlaceholder")}
                defaultValue={opp.next_action ?? ""}
                onBlur={(e) => {
                  if ((e.target.value || null) !== opp.next_action)
                    updateField.mutate({ next_action: e.target.value || null });
                }}
                className="text-sm"
              />
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  className="h-8"
                  defaultValue={opp.next_action_date ?? ""}
                  onChange={(e) =>
                    updateField.mutate({ next_action_date: e.target.value || null })
                  }
                />
              </div>
              {nextActionStatus === "overdue" && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" /> {t("opportunities.detail.overdue")}
                </p>
              )}
              {nextActionStatus === "soon" && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t("opportunities.detail.dueSoon")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("opportunities.detail.summary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">{t("common.stage")}</Label>
                <Select
                  value={opp.stage}
                  onValueChange={(v) => updateStage.mutate(v as OpportunityStage)}
                >
                  <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPPORTUNITY_STAGES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{t(`stage.${s.value}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("common.estimatedFee").replace(" (€)", "")}</Label>
                  <div className="font-semibold">{formatEUR(Number(opp.estimated_fee))}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("common.probability").replace(" (%)", "")}</Label>
                  <div className="font-semibold">{opp.probability}%</div>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("opportunities.detail.source")}</Label>
                <Select
                  value={opp.source ?? "none"}
                  onValueChange={(v) =>
                    updateField.mutate({ source: v === "none" ? null : (v as OpportunitySource) })
                  }
                >
                  <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {OPPORTUNITY_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {t(`opportunities.detail.sourceOption.${s.value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("opportunities.detail.contact")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8"
                  placeholder={t("opportunities.detail.contactName")}
                  defaultValue={opp.contact_name ?? ""}
                  onBlur={(e) => {
                    if ((e.target.value || null) !== opp.contact_name)
                      updateField.mutate({ contact_name: e.target.value || null });
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8"
                  type="email"
                  placeholder={t("opportunities.detail.contactEmail")}
                  defaultValue={opp.contact_email ?? ""}
                  onBlur={(e) => {
                    if ((e.target.value || null) !== opp.contact_email)
                      updateField.mutate({ contact_email: e.target.value || null });
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8"
                  placeholder={t("opportunities.detail.contactPhone")}
                  defaultValue={opp.contact_phone ?? ""}
                  onBlur={(e) => {
                    if ((e.target.value || null) !== opp.contact_phone)
                      updateField.mutate({ contact_phone: e.target.value || null });
                  }}
                />
              </div>
              {opp.company && (
                <div className="pt-2 border-t">
                  <Label className="text-xs text-muted-foreground">{t("opportunities.detail.company")}</Label>
                  <Link
                    to="/crm/companies/$companyId"
                    params={{ companyId: opp.company.id }}
                    className="block text-sm font-medium hover:underline"
                  >
                    {opp.company.nome}
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">{t("opportunities.detail.quotesSection")}</CardTitle>
              {opp.company_id && (
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setQuoteOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="text-sm">
              {quotes.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground">
                  <FileText className="h-5 w-5 opacity-50" />
                  <span>{t("opportunities.detail.noQuotesTitle")}</span>
                </div>
              ) : (
                <ul className="space-y-1">
                  {quotes.map((q) => {
                    const status = QUOTE_STATUSES.find((s) => s.value === q.quote_status);
                    return (
                      <li key={q.id}>
                        <Link
                          to="/crm/quotes/$quoteId"
                          params={{ quoteId: q.id }}
                          className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted text-xs"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${status?.color}`} />
                            <span className="truncate">{q.titulo}</span>
                          </span>
                          <span className="font-medium shrink-0">{formatEUR(Number(q.valor))}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: activity timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("opportunities.activity.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <OpportunityActivityTimeline opportunityId={opp.id} />
          </CardContent>
        </Card>
      </div>

      {opp.company_id && (
        <NewQuoteDialog
          open={quoteOpen}
          onClose={() => setQuoteOpen(false)}
          opportunityId={opp.id}
          companyId={opp.company_id}
          defaultTitle={opp.name}
          defaultFee={Number(opp.estimated_fee)}
        />
      )}

    </div>
  );
}

function getNextActionStatus(date: string | null): "overdue" | "soon" | "ok" | "none" {
  if (!date) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date + "T00:00:00");
  const diffDays = Math.floor((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "soon";
  return "ok";
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
    quote_category: "project" as QuoteCategory,
    quote_type: "standard_project" as QuoteType,
    account_id: "",
    notas: "",
  });

  const setCategory = (cat: QuoteCategory) =>
    setForm((f) => ({
      ...f,
      quote_category: cat,
      quote_type: defaultQuoteTypeForCategory(cat),
      // Time-based and Retainer always bill monthly. Project keeps its choice.
      fee_structure_type: cat === "project" ? f.fee_structure_type : "monthly",
    }));

  const create = useMutation({
    mutationFn: async () => {
      if (!form.titulo.trim()) throw new Error(t("quotes.newQuoteDialog.errorTitle"));
      // Project quotes honour the chosen fee structure; the two time-based
      // categories are always monthly.
      const feeStructure: FeeStructureType =
        form.quote_category === "project" ? form.fee_structure_type : "monthly";
      const { data, error } = await supabase
        .from("fee_proposals")
        .insert({
          titulo: form.titulo.trim(),
          opportunity_id: opportunityId,
          company_id: companyId,
          account_id: form.account_id || null,
          valor: form.valor ? Number(form.valor) : 0,
          fee_structure_type: feeStructure,
          quote_category: form.quote_category,
          quote_type: form.quote_type,
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

  const categoryCards: {
    value: QuoteCategory;
    icon: typeof Briefcase;
  }[] = [
    { value: "project", icon: Briefcase },
    { value: "time_based", icon: Clock },
    { value: "retainer", icon: Wrench },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("quotes.newQuoteDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("quotes.newQuoteDialog.categoryChooserDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* ── Step 1: 3-card top-level chooser ───────────────────── */}
          <div className="grid gap-2 sm:grid-cols-3">
            {categoryCards.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`flex flex-col items-start gap-2 rounded-md border p-4 text-left transition-colors ${
                  form.quote_category === value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">
                    {t(`quotes.newQuoteDialog.category.${value}.title`)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(`quotes.newQuoteDialog.category.${value}.hint`)}
                </p>
              </button>
            ))}
          </div>

          {/* ── Step 2: details ───────────────────────────────────── */}
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
            {/* Fee structure dropdown is project-only. Time-based and
                Retainer are forced to monthly. */}
            {form.quote_category === "project" && (
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
            )}
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
