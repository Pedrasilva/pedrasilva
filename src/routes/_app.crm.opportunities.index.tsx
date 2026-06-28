import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Target, LayoutGrid, List, FileText, ArrowRight, Briefcase, Clock, Repeat2, MoreVertical, Archive, Trash2, ExternalLink } from "lucide-react";
import { QuoteTemplatePicker } from "@/components/quotes/quote-template-picker";
import { useInstantiateQuoteTemplate } from "@/lib/quotes/quote-templates";
import { CompanyPicker } from "@/components/crm/company-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  formatEUR, OPPORTUNITY_STAGES, type CrmOpportunity, type OpportunityStage,
  contactFullName, type Contact,
  defaultQuoteTypeForCategory, type QuoteCategory,
} from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/opportunities/")({
  component: OpportunitiesPage,
});

type QuoteRef = { id: string; updated_at: string; titulo: string | null; pipeline_status: string | null; quote_status: string | null; is_locked: boolean | null; archived_at: string | null; deleted_at: string | null };
type Row = CrmOpportunity & {
  company: { id: string; nome: string } | null;
  contact: Pick<Contact, "id" | "primeiro_nome" | "apelido" | "titulo"> | null;
  quotes: QuoteRef[];
};

function OpportunitiesPage() {
  const { t } = useTranslation("crm");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [chooserOpp, setChooserOpp] = useState<Row | null>(null);
  

  const { data: opps = [], isLoading } = useQuery({
    queryKey: ["crm_opportunities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_opportunities")
        .select(
          "*, company:companies(id, nome), contact:contacts!crm_opportunities_primary_contact_id_fkey(id, primeiro_nome, apelido, titulo), quotes:fee_proposals(id, updated_at, titulo, pipeline_status, quote_status, is_locked, archived_at, deleted_at)",
        )
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Row[];
      // hide archived AND soft-deleted quotes from card listings
      return rows.map((r) => ({
        ...r,
        quotes: (r.quotes ?? []).filter((q) => !q.archived_at && !q.deleted_at),
      }));
    },

  });

  const instantiate = useInstantiateQuoteTemplate();

  const createQuote = useMutation({
    mutationFn: async ({ opp, category, templateId }: { opp: Row; category: QuoteCategory; templateId?: string | null }) => {
      const quote_type = defaultQuoteTypeForCategory(category);
      const fee_structure_type = category === "project" ? "fixed" : "monthly";
      const { data, error } = await supabase
        .from("fee_proposals")
        .insert({
          titulo: opp.name,
          opportunity_id: opp.id,
          company_id: opp.company_id,
          contact_id: opp.primary_contact_id,
          valor: Number(opp.estimated_fee) || 0,
          fee_structure_type,
          quote_category: category,
          quote_type,
          quote_status: "draft",
          pipeline_status: "lead",
          data_proposta: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) throw error;
      if (templateId) {
        try {
          await instantiate.mutateAsync({ quoteId: data.id, templateId });
        } catch (e) {
          toast.error((e as Error).message);
        }
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success(t("quotes.newQuoteDialog.createdToast"));
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      navigate({ to: "/crm/quotes/$quoteId", params: { quoteId: data.id } });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setCreatingFor(null);
      setChooserOpp(null);
    },
  });

  const [confirmDelete, setConfirmDelete] = useState<QuoteRef | null>(null);
  const [confirmText, setConfirmText] = useState("");


  const archiveQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await supabase
        .from("fee_proposals")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", quoteId);
      if (error) throw error;
      return quoteId;
    },
    onSuccess: (quoteId) => {
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      toast.success("Orçamento arquivado", {
        duration: 8000,
        action: {
          label: "Anular",
          onClick: async () => {
            const { error } = await supabase
              .from("fee_proposals")
              .update({ archived_at: null, archived_by: null })
              .eq("id", quoteId);
            if (error) {
              toast.error(error.message);
              return;
            }
            qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
            toast.success("Arquivo anulado");
          },
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await supabase.rpc("soft_delete_fee_proposal", {
        _proposal_id: quoteId,
        _note: undefined,
      });

      if (error) throw error;
      return quoteId;
    },
    onSuccess: (quoteId) => {
      setConfirmDelete(null);
      setConfirmText("");
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      toast.success("Orçamento eliminado", {
        description: "Recuperável em Admin → Papelera de orçamentos",
        duration: 10000,
        action: {
          label: "Anular",
          onClick: async () => {
            const { error } = await supabase.rpc("restore_fee_proposal", { _proposal_id: quoteId });
            if (error) {
              toast.error(error.message);
              return;
            }
            qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
            toast.success("Orçamento restaurado");
          },
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const handleQuoteAction = (e: React.MouseEvent, opp: Row) => {
    e.preventDefault();
    e.stopPropagation();
    const sorted = [...(opp.quotes ?? [])].sort((a, b) =>
      (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
    );
    const latestQuote = sorted[0];
    if (latestQuote) {
      navigate({ to: "/crm/quotes/$quoteId", params: { quoteId: latestQuote.id } });
      return;
    }
    setChooserOpp(opp);
  };

  const handleCardDoubleClick = (oppId: string) => {
    navigate({ to: "/crm/opportunities/$opportunityId", params: { opportunityId: oppId } });
  };

  const byStage = OPPORTUNITY_STAGES.map((s) => ({
    ...s,
    label: t(`stage.${s.value}`),
    items: opps.filter((o) => o.stage === s.value),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {t("opportunities.countAndFee", {
            count: opps.length,
            fee: formatEUR(opps.reduce((s, o) => s + Number(o.estimated_fee), 0)),
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border">
            <Button
              variant={view === "pipeline" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("pipeline")}
              className="rounded-r-none"
            >
              <LayoutGrid className="h-4 w-4 mr-1" /> {t("opportunities.viewPipeline")}
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("list")}
              className="rounded-l-none"
            >
              <List className="h-4 w-4 mr-1" /> {t("opportunities.viewList")}
            </Button>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t("opportunities.newOpportunity")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : opps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-sm text-muted-foreground">
            <Target className="h-8 w-8 opacity-50" />
            <span className="font-medium">{t("opportunities.emptyTitle")}</span>
            <span>{t("opportunities.emptyHint")}</span>
          </CardContent>
        </Card>
      ) : view === "pipeline" ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {byStage.map((col) => {
            const totalCol = col.items.reduce((s, p) => s + Number(p.estimated_fee), 0);
            return (
              <div key={col.value} className="rounded-md border bg-muted/20 p-2 min-h-[200px]">
                <div className="flex items-center justify-between px-1 pb-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className={`h-2 w-2 rounded-full ${col.color}`} />
                    {col.label}
                    <span className="text-xs text-muted-foreground">· {col.items.length}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground px-1 pb-2">{formatEUR(totalCol)}</div>
                <div className="space-y-2">
                  {col.items.map((o) => {
                    const quoteCount = o.quotes?.length ?? 0;
                    const isCreating = createQuote.isPending && creatingFor === o.id;
                    return (
                      <div
                        key={o.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleCardDoubleClick(o.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleCardDoubleClick(o.id);
                          }
                        }}
                        className="relative rounded-md border bg-background p-2 text-sm hover:border-primary/40 hover:shadow-sm transition cursor-pointer select-none"
                      >
                        <div className="font-medium line-clamp-2 hover:underline">{o.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
                          {o.company?.nome ?? t("opportunities.card.noCompany")}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{o.probability}%</span>
                          <span className="font-semibold">{formatEUR(Number(o.estimated_fee))}</span>
                        </div>
                        {(() => {
                          const nad = (o as unknown as { next_action_date: string | null }).next_action_date;
                          const na = (o as unknown as { next_action: string | null }).next_action;
                          const la = (o as unknown as { last_activity_at: string | null }).last_activity_at;
                          let dot = "⚪";
                          if (nad) {
                            const d = Math.floor((new Date(nad + "T00:00:00").getTime() - Date.now()) / 86400000);
                            dot = d < 0 ? "🔴" : d <= 3 ? "🟡" : "";
                          }
                          const lastTxt = la
                            ? t("opportunities.activity.dayAgo", { count: Math.max(0, Math.floor((Date.now() - new Date(la).getTime()) / 86400000)) })
                            : t("opportunities.activity.noContact");
                          return (
                            <>
                              {na && (
                                <div className="mt-1 text-[10px] text-foreground/80 line-clamp-1">
                                  {dot} {na}
                                </div>
                              )}
                              {!na && dot && (
                                <div className="mt-1 text-[10px] text-muted-foreground">{dot}</div>
                              )}
                              <div className="mt-0.5 text-[10px] text-muted-foreground">{lastTxt}</div>
                            </>
                          );
                        })()}
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          {quoteCount > 0
                            ? t("opportunities.card.quotesCount", { count: quoteCount })
                            : t("opportunities.card.noQuotes")}
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            disabled={isCreating}
                            onClick={(e) => handleQuoteAction(e, o)}
                          >
                            {isCreating
                              ? t("common.loading")
                              : quoteCount > 0
                                ? t("opportunities.card.openQuote")
                                : t("opportunities.card.createQuote")}
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                          {quoteCount > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  aria-label="Ações do orçamento"
                                >
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <DropdownMenuLabel className="text-xs">Orçamentos</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {[...(o.quotes ?? [])]
                                  .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
                                  .map((q) => (
                                    <div key={q.id} className="px-1 py-1">
                                      <div className="px-2 pb-1 text-[11px] text-muted-foreground line-clamp-1">
                                        {q.titulo || q.id.slice(0, 8)}
                                        {q.pipeline_status ? ` · ${q.pipeline_status}` : ""}
                                        {q.is_locked ? " · 🔒" : ""}
                                      </div>
                                      <DropdownMenuItem
                                        onSelect={(e) => {
                                          e.preventDefault();
                                          navigate({ to: "/crm/quotes/$quoteId", params: { quoteId: q.id } });
                                        }}
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" /> Abrir
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        disabled={archiveQuote.isPending || !!q.is_locked}
                                        onSelect={(e) => {
                                          e.preventDefault();
                                          archiveQuote.mutate(q.id);
                                        }}
                                      >
                                        <Archive className="h-3.5 w-3.5" /> Arquivar
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        disabled={!!q.is_locked}
                                        className="text-destructive focus:text-destructive"
                                        onSelect={(e) => {
                                          e.preventDefault();
                                          setConfirmDelete(q);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                                      </DropdownMenuItem>
                                    </div>
                                  ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">{t("opportunities.tableName")}</th>
                  <th className="px-3 py-2">{t("opportunities.tableCompany")}</th>
                  <th className="px-3 py-2">{t("common.primaryContact")}</th>
                  <th className="px-3 py-2">{t("opportunities.tableStage")}</th>
                  <th className="px-3 py-2 text-right">{t("opportunities.tableEstFee")}</th>
                  <th className="px-3 py-2 text-right">{t("opportunities.tableProb")}</th>
                  <th className="px-3 py-2 text-right">{t("opportunities.detail.quotesSection")}</th>
                </tr>
              </thead>
              <tbody>
                {opps.map((o) => {
                  const stage = OPPORTUNITY_STAGES.find((s) => s.value === o.stage);
                  const quoteCount = o.quotes?.length ?? 0;
                  return (
                    <tr key={o.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link
                          to="/crm/opportunities/$opportunityId"
                          params={{ opportunityId: o.id }}
                          className="font-medium hover:underline"
                        >
                          {o.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{o.company?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {o.contact ? contactFullName(o.contact) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className={`h-2 w-2 rounded-full ${stage?.color}`} />
                          {stage ? t(`stage.${stage.value}`) : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatEUR(Number(o.estimated_fee))}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{o.probability}%</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{quoteCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <NewOpportunityDialog open={open} onClose={() => setOpen(false)} />
      <QuoteCategoryChooserDialog
        opp={chooserOpp}
        onClose={() => setChooserOpp(null)}
        onPick={(category, templateId) => {
          if (!chooserOpp) return;
          setCreatingFor(chooserOpp.id);
          createQuote.mutate({ opp: chooserOpp, category, templateId });
        }}
        isPending={createQuote.isPending}
      />
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(v) => {
          if (!v) {
            setConfirmDelete(null);
            setConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar orçamento?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Esta acção marca o orçamento como eliminado. Um snapshot
                  completo (etapas, alocações, fornecedores, faturação e documento)
                  é guardado no registo de auditoria e pode ser recuperado por um
                  administrador.
                </p>
                <p>
                  Para confirmar, escreva o título do orçamento abaixo:
                  <br />
                  <span className="font-mono text-foreground">
                    {confirmDelete?.titulo ?? confirmDelete?.id.slice(0, 8) ?? ""}
                  </span>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Escreva o título exato"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteQuote.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                deleteQuote.isPending ||
                confirmText.trim() !==
                  (confirmDelete?.titulo ?? confirmDelete?.id.slice(0, 8) ?? "").trim()
              }
              onClick={() => confirmDelete && deleteQuote.mutate(confirmDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

function QuoteCategoryChooserDialog({
  opp, onClose, onPick, isPending,
}: {
  opp: Row | null;
  onClose: () => void;
  onPick: (category: QuoteCategory, templateId: string | null) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation("crm");
  const [step, setStep] = useState<1 | 2>(1);
  const [category, setCategory] = useState<QuoteCategory>("project");
  const [templateId, setTemplateId] = useState<string | null>(null);

  const cards: { value: QuoteCategory; icon: typeof Briefcase }[] = [
    { value: "project", icon: Briefcase },
    { value: "time_based", icon: Clock },
    { value: "retainer", icon: Repeat2 },
  ];

  const handleClose = () => {
    if (isPending) return;
    setStep(1);
    setTemplateId(null);
    onClose();
  };

  return (
    <Dialog open={!!opp} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("quotes.newQuoteDialog.title")}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? t("quotes.newQuoteDialog.categoryChooserDescription")
              : t("templates.picker.label")}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {cards.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                disabled={isPending}
                onClick={() => { setCategory(value); setStep(2); }}
                className="flex flex-col items-start gap-2 rounded-md border p-4 text-left transition-colors hover:bg-muted/50 hover:border-primary/40 disabled:opacity-50"
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
        ) : (
          <div className="grid gap-3">
            <Label>{t("templates.picker.label")}</Label>
            <div className="max-h-72 overflow-y-auto">
              <QuoteTemplatePicker
                category={category}
                value={templateId}
                onChange={setTemplateId}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button variant="ghost" onClick={() => setStep(1)} disabled={isPending}>
              {t("common.back")}
            </Button>
          )}
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            {t("common.cancel")}
          </Button>
          {step === 2 && (
            <Button onClick={() => onPick(category, templateId)} disabled={isPending}>
              {t("quotes.newQuoteDialog.createButton")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewOpportunityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    company_id: "",
    stage: "lead" as OpportunityStage,
    estimated_fee: "",
    probability: "50",
    expected_start_date: "",
    notas: "",
  });

  const reset = () =>
    setForm({
      name: "",
      company_id: "",
      stage: "lead",
      estimated_fee: "",
      probability: "50",
      expected_start_date: "",
      notas: "",
    });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error(t("opportunities.dialog.errorName"));
      const { data, error } = await supabase.from("crm_opportunities").insert({
        name: form.name.trim(),
        company_id: form.company_id || null,
        stage: form.stage,
        estimated_fee: form.estimated_fee ? Number(form.estimated_fee) : 0,
        probability: Number(form.probability) || 0,
        expected_start_date: form.expected_start_date || null,
        notas: form.notas || null,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(t("opportunities.dialog.createdToast"));
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("opportunities.dialog.title")}</DialogTitle>
          <DialogDescription>{t("opportunities.dialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t("common.name")} *</Label>
            <Input
              placeholder={t("opportunities.dialog.namePlaceholder")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>{t("common.company")}</Label>
            <CompanyPicker
              value={form.company_id || null}
              onChange={(id) => setForm((f) => ({ ...f, company_id: id }))}
              placeholder={t("opportunities.dialog.companyPlaceholder")}
            />
          </div>
          <div>
            <Label>{t("common.estimatedFee")}</Label>
            <Input
              type="number"
              step="0.01"
              value={form.estimated_fee}
              onChange={(e) => setForm((f) => ({ ...f, estimated_fee: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("common.probability")}</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.probability}
              onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("common.stage")}</Label>
            <Select
              value={form.stage}
              onValueChange={(v) => setForm((f) => ({ ...f, stage: v as OpportunityStage }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPPORTUNITY_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{t(`stage.${s.value}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("common.expectedStart")}</Label>
            <Input
              type="date"
              value={form.expected_start_date}
              onChange={(e) => setForm((f) => ({ ...f, expected_start_date: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
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
            disabled={create.isPending || !form.name.trim()}
          >
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Placeholder export to satisfy unused import linter when contactFullName not used inline
export { contactFullName };
