import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useRecordRecentlyViewed } from "@/hooks/use-recently-viewed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { QuoteWorkflowActions } from "@/components/quotes/quote-workflow-actions";
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
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  QUOTE_STATUSES, FEE_STRUCTURE_TYPES, normalizeQuoteCategory,
  type FeeProposal, type QuoteStatus, type FeeStructureType,
} from "@/lib/crm/types";
import { QuotePlanningTab } from "@/components/quotes/quote-planning-tab";
import { QuoteExternalServicesTab } from "@/components/quotes/quote-external-services-tab";
import { QuotePaymentScheduleTab } from "@/components/quotes/quote-payment-schedule-tab";
import { QuoteFinancialSummaryTab } from "@/components/quotes/quote-financial-summary-tab";
import { QuoteProposalTab } from "@/components/quotes/quote-proposal-tab";
import { QuoteTimeBasedSettingsTab } from "@/components/quotes/quote-time-based-settings-tab";
import { QuoteFeeCalculatorCard } from "@/components/quotes/quote-fee-calculator-card";
import {
  QuoteWorkflowStepper,
  type QuoteStep,
} from "@/components/quotes/quote-workflow-stepper";
import { QuotePublishStep } from "@/components/quotes/quote-publish-step";
import { SaveAsTemplateDialog } from "@/components/quotes/save-as-template-dialog";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { useQuotePaymentSchedule } from "@/lib/quotes/use-quote-payment-schedule";
import { rollupQuote } from "@/lib/quotes/financial-rollups";

export const Route = createFileRoute("/_app/crm/quotes/$quoteId")({
  component: QuoteDetail,
});

type FullQuote = FeeProposal & {
  opportunity: { id: string; name: string; stage: string; company_id: string } | null;
  account: { id: string; name: string } | null;
  company: { id: string; nome: string } | null;
  pricing_multiplier?: number | null;
  proposal_description?: string | null;
  construction_cost?: number | null;
  fee_percentage?: number | null;
  project_fee_calculation?: unknown;
};

function QuoteDetail() {
  const { t } = useTranslation("crm");
  const { quoteId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: quote, isLoading } = useQuery({
    queryKey: ["fee_proposal", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select(`
          *,
          opportunity:crm_opportunities(id, name, stage, company_id),
          account:crm_accounts(id, name),
          company:companies(id, nome)
        `)
        .eq("id", quoteId)
        .single();
      if (error) throw error;
      return data as FullQuote;
    },
  });

  useRecordRecentlyViewed({
    module: "crm",
    href: `/crm/quotes/${quoteId}`,
    label: quote?.titulo ?? "",
  });



  const { data: accounts = [] } = useQuery({
    queryKey: ["crm_accounts_by_company", quote?.company_id],
    queryFn: async () => {
      if (!quote?.company_id) return [];
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("id, name")
        .eq("company_id", quote.company_id)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: !!quote?.company_id,
  });

  const [form, setForm] = useState({
    titulo: "",
    valor: "",
    fee_structure_type: "fixed" as FeeStructureType,
    account_id: "",
    quote_status: "draft" as QuoteStatus,
    notas: "",
    proposal_description: "",
    construction_cost: "",
    fee_percentage: "",
    pricing_multiplier: "1",
  });

  useEffect(() => {
    if (quote) {
      setForm({
        titulo: quote.titulo,
        valor: String(quote.valor),
        fee_structure_type: quote.fee_structure_type,
        account_id: quote.account_id ?? "",
        quote_status: quote.quote_status,
        notas: quote.notas ?? "",
        proposal_description: quote.proposal_description ?? "",
        construction_cost: quote.construction_cost != null ? String(quote.construction_cost) : "",
        fee_percentage: quote.fee_percentage != null ? String(quote.fee_percentage) : "",
        pricing_multiplier: String(quote.pricing_multiplier ?? 1),
      });
    }
  }, [quote]);

  const save = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any = {
        titulo: form.titulo.trim(),
        valor: form.valor ? Number(form.valor) : 0,
        fee_structure_type: form.fee_structure_type,
        account_id: form.account_id || null,
        quote_status: form.quote_status,
        notas: form.notas || null,
        proposal_description: form.proposal_description || null,
        construction_cost: form.construction_cost ? Number(form.construction_cost) : null,
        fee_percentage: form.fee_percentage ? Number(form.fee_percentage) : null,
        pricing_multiplier: form.pricing_multiplier ? Number(form.pricing_multiplier) : 1,
      };
      const { error } = await supabase.from("fee_proposals").update(updates).eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("quotes.savedToast"));
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunity"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fee_proposals").delete().eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("quotes.deletedToast"));
      if (quote?.opportunity_id) {
        navigate({ to: "/crm/opportunities/$opportunityId", params: { opportunityId: quote.opportunity_id } });
      } else {
        navigate({ to: "/crm/opportunities" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error(t("quotes.loadError"));
      if (quote.quote_status !== "approved") throw new Error(t("quotes.convertOnlyApproved"));
      if (quote.pm_project_id) {
        return {
          id: quote.pm_project_id,
          alreadyExisted: true,
          stagesCopied: 0,
          dependenciesCopied: 0,
          allocationsCopied: 0,
          allocationsSkipped: 0,
          externalCopied: 0,
        };
      }

      // 0. Snapshot the agreed commercial baseline BEFORE creating the
      //    project. We compute the rollup from the live quote data so the
      //    sold_fee is exactly what was approved — independent of any
      //    future changes to project allocations or rates.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [{ data: snapAllocs }, { data: snapExt }] = await Promise.all([
        db
          .from("quote_allocations")
          .select("*, resource:pm_resources(id, name, color, role)")
          .eq("quote_id", quote.id),
        db
          .from("quote_external_services")
          .select("*, supplier:pm_suppliers(id, name)")
          .eq("quote_id", quote.id),
      ]);
      const soldSummary = rollupQuote({
        allocations: snapAllocs ?? [],
        externalServices: snapExt ?? [],
        pricingMultiplier: Number(quote.pricing_multiplier ?? 1),
      });

      // 1. Create the project shell with the locked commercial baseline.
      const { data: project, error: projErr } = await supabase
        .from("pm_projects")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          name: quote.titulo,
          status: "active",
          start_date: new Date().toISOString().slice(0, 10),
          company_id: quote.company_id,
          account_id: quote.account_id,
          quote_id: quote.id,
          opportunity_id: quote.opportunity_id,
          notes: `Created from quote "${quote.titulo}"`,
          // Locked commercial baseline — DB trigger prevents future edits.
          sold_fee: soldSummary.totalFee,
          sold_internal_fee: soldSummary.internal.value * soldSummary.pricingMultiplier,
          sold_external_fee: soldSummary.external.value * soldSummary.pricingMultiplier,
          sold_pricing_multiplier: soldSummary.pricingMultiplier,
          sold_at: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id")
        .single();
      if (projErr) throw projErr;

      // 2. Copy quote_stages → pm_stages, keeping a mapping for allocations.
      const { data: qStages, error: qsErr } = await db
        .from("quote_stages")
        .select("id, name, start_date, end_date, color, sort_order, budget")
        .eq("quote_id", quote.id)
        .order("sort_order", { ascending: true });
      if (qsErr) throw qsErr;

      const stageIdMap = new Map<string, string>();
      for (const s of qStages ?? []) {
        const { data: created, error: insErr } = await db
          .from("pm_stages")
          .insert({
            project_id: project.id,
            name: s.name,
            start_date: s.start_date,
            end_date: s.end_date,
            color: s.color ?? "#22c55e",
            sort_order: s.sort_order ?? 0,
            budget: Number(s.budget ?? 0),
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        stageIdMap.set(s.id, created.id);
      }
      const stagesCopied = stageIdMap.size;

      // 2b. Copy quote_stage_dependencies → pm_stage_dependencies, remapping
      //     predecessor/successor IDs through stageIdMap. Skip silently if
      //     either endpoint is missing (defensive — schema FKs prevent it).
      let dependenciesCopied = 0;
      const { data: qDeps, error: qdErr } = await db
        .from("quote_stage_dependencies")
        .select("predecessor_stage_id, successor_stage_id, type, lag_days")
        .eq("quote_id", quote.id);
      if (qdErr) throw qdErr;
      for (const d of qDeps ?? []) {
        const pred = stageIdMap.get(d.predecessor_stage_id);
        const succ = stageIdMap.get(d.successor_stage_id);
        if (!pred || !succ) continue;
        const { error: dErr } = await db.from("pm_stage_dependencies").insert({
          predecessor_id: pred,
          successor_id: succ,
          type: d.type ?? "FS",
          lag_days: Number(d.lag_days ?? 0),
        });
        if (dErr) throw dErr;
        dependenciesCopied += 1;
      }

      // 3. Copy quote_allocations → pm_allocations (committed status).
      const { data: qAllocs, error: qaErr } = await db
        .from("quote_allocations")
        .select("stage_id, resource_id, start_date, end_date, hours_per_day")
        .eq("quote_id", quote.id);
      if (qaErr) throw qaErr;

      let allocationsCopied = 0;
      let allocationsSkipped = 0;
      for (const a of qAllocs ?? []) {
        const newStageId = stageIdMap.get(a.stage_id);
        if (!newStageId) {
          // Stage was deleted mid-copy or never existed — surface in toast.
          allocationsSkipped += 1;
          // eslint-disable-next-line no-console
          console.warn("Quote→Project conversion: skipped allocation with missing stage", a);
          continue;
        }
        const { error: aErr } = await db.from("pm_allocations").insert({
          stage_id: newStageId,
          resource_id: a.resource_id,
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day ?? 8),
          status: "committed",
        });
        if (aErr) throw aErr;
        allocationsCopied += 1;
      }

      // 4. Copy quote_external_services → pm_materials.
      const { data: qExt, error: qeErr } = await db
        .from("quote_external_services")
        .select(
          "description, supplier_id, quantity, unit_cost, purchase_price, markup_type, markup_value, sale_price, sale_price_manual, status, notes",
        )
        .eq("quote_id", quote.id);
      if (qeErr) throw qeErr;

      let externalCopied = 0;
      for (const e of qExt ?? []) {
        const { error: mErr } = await db.from("pm_materials").insert({
          project_id: project.id,
          description: e.description,
          supplier_id: e.supplier_id,
          quantity: Number(e.quantity ?? 1),
          unit_cost: Number(e.unit_cost ?? 0),
          purchase_price: Number(e.purchase_price ?? 0),
          markup_type: e.markup_type ?? "percent",
          markup_value: Number(e.markup_value ?? 0),
          sale_price: Number(e.sale_price ?? 0),
          sale_price_manual: !!e.sale_price_manual,
          status: e.status ?? "draft",
          notes: e.notes,
        });
        if (mErr) throw mErr;
        externalCopied += 1;
      }

      // 5. Link the project back to the quote and mark opportunity as won.
      const { error: linkErr } = await supabase
        .from("fee_proposals")
        .update({ pm_project_id: project.id })
        .eq("id", quote.id);
      if (linkErr) throw linkErr;

      if (quote.opportunity_id) {
        await supabase.from("crm_opportunities").update({ stage: "won" }).eq("id", quote.opportunity_id);
      }
      return {
        id: project.id,
        alreadyExisted: false,
        stagesCopied,
        dependenciesCopied,
        allocationsCopied,
        allocationsSkipped,
        externalCopied,
      };
    },
    onSuccess: (res) => {
      if (res.alreadyExisted) {
        toast.success(t("quotes.convertExisting"));
      } else {
        toast.success(
          t("quotes.convertSummary", {
            stages: res.stagesCopied,
            allocations: res.allocationsCopied,
            external: res.externalCopied,
            dependencies: res.dependenciesCopied,
          }),
        );
        if (res.allocationsSkipped > 0) {
          toast.warning(
            t("quotes.convertSkipped", { count: res.allocationsSkipped }),
          );
        }
      }
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["crm_opportunity"] });
      navigate({ to: "/projects/$projectId", params: { projectId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Convert prompt is owned by React state (AlertDialog), not by the
  // browser's native confirm(). This guarantees the prompt is only shown
  // when the user clicks the dedicated Convert button — never as a
  // side-effect of approving or any other status transition.
  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const handleConvert = () => {
    if (!quote) return;
    if (quote.pm_project_id) {
      // Already exists — go straight to it without a confirm prompt.
      convert.mutate();
      return;
    }
    setConvertOpen(true);
  };

  // Pre-conversion integrity warnings — reuses the same builder as the
  // Planning/Financial tabs so the user sees consistent signals everywhere.
  // Hooks must run before any early return: never gate them on `quote`.
  const stagesQ = useQuoteStages(quoteId);
  const allocsQ = useQuoteAllocations(quoteId);
  const externalQ = useQuoteExternalServices(quoteId);
  const paymentQ = useQuotePaymentSchedule(quoteId);
  const preConvertWarnings = useMemo(() => {
    const stages = stagesQ.data ?? [];
    const allocations = allocsQ.data ?? [];
    const externalServices = externalQ.data ?? [];
    const multiplier = Number(form.pricing_multiplier) || 1;
    const summary = rollupQuote({
      allocations,
      externalServices,
      pricingMultiplier: multiplier,
    });
    return buildQuoteWarnings({
      stages,
      allocations,
      externalServices,
      summary,
    });
  }, [stagesQ.data, allocsQ.data, externalQ.data, form.pricing_multiplier]);

  // Linear workflow state — orchestration only. All underlying tabs and
  // components below are preserved unchanged; the stepper just filters
  // which secondary tabs are surfaced per step.
  const [step, setStep] = useState<QuoteStep>("estimate");

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!quote) return <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>;

  const status = QUOTE_STATUSES.find((s) => s.value === quote.quote_status);
  const canConvert = quote.quote_status === "approved";
  const pricingMultiplier = Number(form.pricing_multiplier) || 1;
  const category = normalizeQuoteCategory(quote.quote_category);
  const isProject = category === "project";

  // Soft completion signals for the stepper. Non-blocking — these only
  // drive the visual tick on each step.
  const stagesCount = stagesQ.data?.length ?? 0;
  const allocationsCount = allocsQ.data?.length ?? 0;
  const paymentCount = paymentQ.data?.length ?? 0;
  const hasProposalContent =
    !!(form.proposal_description?.trim() || quote.proposal_description?.trim());
  const completion = {
    estimate: isProject ? stagesCount > 0 : allocationsCount > 0,
    content: hasProposalContent,
    publish: !!quote.pm_project_id,
  } as const;

  // Per-step visible secondary tabs. All TabsContent below remain mounted
  // in the DOM (Radix Tabs only renders the active one); we just hide the
  // triggers that are not part of the current step.
  // Project quotes no longer expose the "Tempo" tab — proposal type is set
  // at quote-creation time and cannot be switched from within a Standard
  // Project workspace. The two time-based proposal types keep the tab as
  // their primary fee configuration surface. Phase-level retainer billing
  // is intentionally deferred and is NOT a proposal-type switch.
  const estimateTabs = isProject
    ? ["overview", "planning", "external", "payment", "financial"]
    : ["overview", "time-based", "financial"];
  const contentTabs = ["proposal"];
  const visibleTabs =
    step === "estimate"
      ? estimateTabs
      : step === "content"
        ? contentTabs
        : [];

  return (
    <div className="space-y-6">
      {quote.opportunity ? (
        <Link to="/crm/opportunities/$opportunityId" params={{ opportunityId: quote.opportunity.id }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> {t("quotes.backToOpportunity")}
        </Link>
      ) : (
        <Link to="/crm/opportunities"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> {t("quotes.backToOpportunities")}
        </Link>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{quote.titulo}</h2>
          <p className="text-sm text-muted-foreground">
            {quote.company?.nome ?? "—"}
            {quote.opportunity && (
              <>{" · "}
                <Link to="/crm/opportunities/$opportunityId"
                  params={{ opportunityId: quote.opportunity.id }} className="hover:underline">
                  {quote.opportunity.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <span className={`h-2 w-2 rounded-full ${status?.color}`} />
            {status ? t(`quoteStatus.${status.value}`) : ""}
          </span>
          <span className="inline-flex items-center rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium">
            {t(`quoteType.${quote.quote_type ?? "standard_project"}.label`)}
          </span>
          <QuoteWorkflowActions
            quoteId={quoteId}
            status={quote.quote_status}
            hasAccount={!!quote.account_id}
            hasProject={!!quote.pm_project_id}
            onConvert={handleConvert}
            isConverting={convert.isPending}
          />
          {quote.pm_project_id && (
            <Link to="/projects/$projectId" params={{ projectId: quote.pm_project_id }}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs hover:bg-muted/50">
              <ExternalLink className="h-3 w-3" /> {t("quotes.openProject")}
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(true)}>
            {t("templates.actions.saveAs")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <QuoteWorkflowStepper
        step={step}
        onChange={setStep}
        completion={completion}
      />

      {step === "publish" && (
        <QuotePublishStep
          quoteId={quoteId}
          estimateReady={completion.estimate}
          contentReady={completion.content}
          paymentReady={paymentCount > 0}
          hasProject={!!quote.pm_project_id}
          projectId={quote.pm_project_id ?? null}
        />
      )}

      <Tabs
        defaultValue="overview"
        className={cn("w-full", step === "publish" && "hidden")}
      >
        <TabsList className="no-print">
          {visibleTabs.includes("overview") && (
            <TabsTrigger value="overview">{t("workspace.tabs.overview")}</TabsTrigger>
          )}
          {/* Time-based tab is always shown — for project quotes the optional
              retainer/consultancy add-on figures live there, and for
              consultancy quotes it is the primary fee configuration tab. */}
          {visibleTabs.includes("time-based") && (
            <TabsTrigger value="time-based">{t("workspace.tabs.timeBased")}</TabsTrigger>
          )}
          {/* Planning (Gantt + stages), External services and Payment schedule
              are project-only — consultancy proposals do not have stages,
              dependencies or stage-driven payment milestones. */}
          {isProject && visibleTabs.includes("planning") && (
            <TabsTrigger value="planning">{t("workspace.tabs.planning")}</TabsTrigger>
          )}
          {isProject && visibleTabs.includes("external") && (
            <TabsTrigger value="external">{t("workspace.tabs.external")}</TabsTrigger>
          )}
          {isProject && visibleTabs.includes("payment") && (
            <TabsTrigger value="payment">{t("workspace.tabs.payment")}</TabsTrigger>
          )}
          {visibleTabs.includes("financial") && (
            <TabsTrigger value="financial">{t("workspace.tabs.financial")}</TabsTrigger>
          )}
          {visibleTabs.includes("proposal") && (
            <TabsTrigger value="proposal">{t("workspace.tabs.proposal")}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {isProject && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("workspace.overview.calculatorIntroTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {t("workspace.overview.calculatorIntroHint")}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">{t("quotes.feeDetails")}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>{t("common.title")}</Label>
                <Input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
              </div>
              <div>
                <Label>{t("common.estimatedFee")}</Label>
                <Input type="number" step="0.01" value={form.valor}
                  onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
              </div>
              <div>
                <Label>{t("common.feeStructure")}</Label>
                <Select value={form.fee_structure_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, fee_structure_type: v as FeeStructureType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FEE_STRUCTURE_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{t(`feeStructure.${s.value}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Construction cost / fee percentage are project-quote
                  concepts (% of construction value). Hidden for
                  consultancy quotes which bill hourly. */}
              {isProject && (
                <>
                  <div>
                    <Label>{t("workspace.overview.constructionCost")}</Label>
                    <Input type="number" step="0.01" value={form.construction_cost}
                      onChange={(e) => setForm((f) => ({ ...f, construction_cost: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("workspace.overview.feePercentage")}</Label>
                    <Input type="number" step="0.01" value={form.fee_percentage}
                      onChange={(e) => setForm((f) => ({ ...f, fee_percentage: e.target.value }))} />
                  </div>
                </>
              )}
              <div>
                <Label>{t("workspace.overview.pricingMultiplier")}</Label>
                <Input type="number" step="0.01" value={form.pricing_multiplier}
                  onChange={(e) => setForm((f) => ({ ...f, pricing_multiplier: e.target.value }))} />
              </div>
              {/* Non-project quotes keep account/status/description/notes
                  on this tab — they have no calculator and this is still
                  their main metadata surface. For project quotes those
                  fields live in the quote header (status), Publish step
                  (account/conversion), Step 2 Content (description) and
                  the activity stream (notes). */}
              {!isProject && (
                <>
                  <div>
                    <Label>{t("common.account")}</Label>
                    <Select value={form.account_id || "none"}
                      onValueChange={(v) => setForm((f) => ({ ...f, account_id: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder={t("common.noAccount")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("common.noAccount")}</SelectItem>
                        {accounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("common.status")}</Label>
                    <Select value={form.quote_status}
                      onValueChange={(v) => setForm((f) => ({ ...f, quote_status: v as QuoteStatus }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {QUOTE_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {t(`quoteStatus.${s.value}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t("workspace.overview.proposalDescription")}</Label>
                    <Textarea rows={4} value={form.proposal_description}
                      onChange={(e) => setForm((f) => ({ ...f, proposal_description: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t("common.notes")}</Label>
                    <Textarea rows={3} value={form.notas}
                      onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
                  </div>
                </>
              )}
              <div className="sm:col-span-2 flex justify-end">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("common.save")}</Button>
              </div>
            </CardContent>
          </Card>

          {/* Construction-percentage architectural fee calculator. Project
              Proposals only — Consultancy quotes bill hourly and skip this.
              The conversion-to-project card was intentionally removed from
              this tab: conversion lives in the quote header (workflow
              actions) and the Publish step, so it cannot compete visually
              with the calculator. */}
          {isProject && (
            <div className="mt-4">
              <QuoteFeeCalculatorCard
                quoteId={quoteId}
                initialPayload={quote.project_fee_calculation}
                onApplied={(finalFee, constructionValue, feePct) => {
                  setForm((f) => ({
                    ...f,
                    valor: String(Math.round(finalFee * 100) / 100),
                    construction_cost: constructionValue ? String(constructionValue) : "",
                    fee_percentage: feePct ? String(Number(feePct.toFixed(4))) : "",
                  }));
                }}
              />
            </div>
          )}
        </TabsContent>


        {!isProject && (
          <TabsContent value="time-based" className="mt-4">
            <QuoteTimeBasedSettingsTab
              quoteId={quoteId}
              quoteType={quote.quote_type}
              quoteCategory={quote.quote_category}
            />
          </TabsContent>
        )}
        {isProject && (
          <>
            <TabsContent value="planning" className="mt-4">
              <QuotePlanningTab quoteId={quoteId} pricingMultiplier={pricingMultiplier} />
            </TabsContent>
            <TabsContent value="external" className="mt-4">
              <QuoteExternalServicesTab quoteId={quoteId} />
            </TabsContent>
            <TabsContent value="payment" className="mt-4">
              <QuotePaymentScheduleTab quoteId={quoteId} />
            </TabsContent>
          </>
        )}
        <TabsContent value="financial" className="mt-4">
          <QuoteFinancialSummaryTab quoteId={quoteId} pricingMultiplier={pricingMultiplier} />
        </TabsContent>
        <TabsContent value="proposal" className="mt-4">
          <QuoteProposalTab
            quoteId={quoteId}
            pricingMultiplier={pricingMultiplier}
            title={form.titulo || quote.titulo}
            description={form.proposal_description || quote.proposal_description || quote.notas}
            clientName={quote.company?.nome ?? null}
            accountName={quote.account?.name ?? null}
            quoteType={quote.quote_type ?? "standard_project"}
            quoteCategory={quote.quote_category}
          />
        </TabsContent>
      </Tabs>

      {/* Convert dialog — owned exclusively by the dedicated Convert
          button. Cannot be triggered as a side-effect of approval. */}
      <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quotes.convertDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("quotes.convertDialog.description")}
              {!quote.account_id && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  {t("quotes.convertNoAccountWarning")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConvertOpen(false);
                convert.mutate();
              }}
            >
              {t("quotes.convertDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quotes.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("quotes.deleteDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteOpen(false);
                remove.mutate();
              }}
            >
              {t("quotes.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SaveAsTemplateDialog
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        quoteId={quoteId}
        defaultName={quote.titulo}
        defaultCategory={category}
      />
    </div>
  );
}
