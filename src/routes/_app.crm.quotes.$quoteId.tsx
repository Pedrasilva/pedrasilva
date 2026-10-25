import { translateError } from '@/lib/translate-error';
import uiI18n from "@/i18n/index";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ConversionInvoicePreview } from "@/components/quotes/conversion-invoice-preview";
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
import { ArrowLeft, Copy, MoreHorizontal, RefreshCw, Settings, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from '@/lib/toast';
import { QuoteWorkflowActions } from "@/components/quotes/quote-workflow-actions";
import { QuoteBuildSettingsDialog } from "@/components/quotes/quote-build-settings-dialog";
import { InlineEditableTitle } from "@/components/inline-editable-title";
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
  type FeeProposal, type QuoteStatus, type FeeStructureType} from "@/lib/crm/types";
import { QuotePlanningTab } from "@/components/quotes/quote-planning-tab";
import { QuoteExternalServicesTab } from "@/components/quotes/quote-external-services-tab";
import { QuoteConstructionAssistanceTab } from "@/components/quotes/quote-construction-assistance-tab";
import { QuoteBillableRatesTab } from "@/components/quotes/quote-billable-rates-tab";
import { QuotePaymentScheduleTab } from "@/components/quotes/quote-payment-schedule-tab";
import { QuoteFinancialSummaryTab, ArchitectureFinancialBreakdown } from "@/components/quotes/quote-financial-summary-tab";
import { QuoteProposalComposerEmbed } from "@/components/quotes/quote-proposal-composer-embed";
import { QuoteTimeBasedSettingsTab } from "@/components/quotes/quote-time-based-settings-tab";
import { QuoteFeeCalculatorCard } from "@/components/quotes/quote-fee-calculator-card";
import { QuoteOntologyBootstrapCard } from "@/components/quotes/quote-ontology-bootstrap-card";
import { QuoteCreateContractCard } from "@/components/quotes/quote-create-contract-card";
import {
  QuoteWorkflowStepper,
  type QuoteStep,
} from "@/components/quotes/quote-workflow-stepper";
import { QuotePublishStep } from "@/components/quotes/quote-publish-step";
import {
  QuoteStatusRail,
  resolveQuoteLifecycle,
} from "@/components/quotes/quote-status-rail";
import { useQuoteSignature } from "@/lib/quotes/use-quote-signature";
import { SaveAsTemplateDialog } from "@/components/quotes/save-as-template-dialog";
import { QuoteLockGuard } from "@/components/quotes/quote-lock-guard";
import { QuoteRevisionsButton } from "@/components/quotes/quote-revisions-button";

import { useAuth } from "@/hooks/use-auth";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { useQuotePaymentSchedule } from "@/lib/quotes/use-quote-payment-schedule";
import { useSyncQuotePaymentScheduleFromGantt } from "@/lib/quotes/use-sync-quote-payment-schedule";
import { rollupQuote } from "@/lib/quotes/financial-rollups";
import {
  anchorMonthStart,
  anchorMonthEnd,
  shiftAnchor,
  formatAnchorMonth,
} from "@/lib/quotes/retainer-monthly";
import { parseISO, format as fmtDate, max as maxDate, min as minDate } from "date-fns";
import { PSA_ENTITY_ID } from "@/lib/finance/entity";
import { numberStages, formatStageLabel } from "@/lib/quotes/stage-numbering";

export const Route = createFileRoute("/_app/crm/quotes/$quoteId")({
  validateSearch: (search: Record<string, unknown>): { step?: "publish" } => ({ step: search.step === "publish" ? "publish" : undefined }),
  head:()=>({meta:[{title:"Proposal planning | PSA Hub"},{name:"description",content:"Proposal schedules, commercial terms and project conversion in PSA Hub."},{property:"og:title",content:"Proposal planning | PSA Hub"},{property:"og:description",content:"Proposal schedules, commercial terms and project conversion in PSA Hub."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),
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

const quoteWorkspaceStepKey = (quoteId: string) => `psa.quoteWorkspaceStep.${quoteId}`;

function isQuoteStep(value: unknown): value is QuoteStep {
  return value === "estimate" || value === "content" || value === "publish";
}

function readSavedQuoteStep(quoteId: string): QuoteStep {
  if (typeof window === "undefined") return "estimate";
  const saved = window.sessionStorage.getItem(quoteWorkspaceStepKey(quoteId));
  return isQuoteStep(saved) ? saved : "estimate";
}

function QuoteDetail() {
  const { t } = useTranslation("crm");
  const { quoteId } = Route.useParams();
  const { step: requestedStep } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const signatureQ = useQuoteSignature(quoteId);

  // Fork this quote into a new editable revision (base quote stays untouched).
  const reviseQuote = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("clone_fee_proposal_as_revision", {
        p_source: quoteId,
      });
      if (error) throw new Error(error.message);
      return data as unknown as string;
    },
    onSuccess: (newId) => {
      toast.success(uiI18n.t("crm:quoteEditor.openingRevision"));
      qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunity"] });
      navigate({ to: "/crm/quotes/$quoteId", params: { quoteId: newId } });
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
  });



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
    onError: (e: Error) => toast.error(translateError(e.message)),
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
    onError: (e: Error) => toast.error(translateError(e.message)),
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

      if (!conversionPreview) throw new Error(t("projects:gantt.relative.previewRequired"));
      const {data,error}=await supabase.rpc("pm_convert_relative_quote",{_quote:quote.id,_start:conversionStart,_revision:conversionPreview.revision});
      if(error)throw error;
      return data as unknown as {id:string;alreadyExisted:boolean;stagesCopied:number;dependenciesCopied:number;allocationsCopied:number;allocationsSkipped:number;externalCopied:number};
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
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunity_projects"] });
      qc.invalidateQueries({ queryKey: ["crm-opportunities-overview"] });
      // Land on the allocations page so the PM can assign resources to
      // stages right after activation. They can skip and do it later by
      // navigating to the project overview.
      if (res.alreadyExisted) {
        navigate({ to: "/projects/$projectId", params: { projectId: res.id } });
      } else {
        navigate({ to: "/projects/$projectId/allocations", params: { projectId: res.id } });
      }
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
  });

  // Convert prompt is owned by React state (AlertDialog), not by the
  // browser's native confirm(). This guarantees the prompt is only shown
  // when the user clicks the dedicated Convert button — never as a
  // side-effect of approving or any other status transition.
  const [convertOpen, setConvertOpen] = useState(false);
  const [conversionStart,setConversionStart]=useState("");
  const [conversionPreview,setConversionPreview]=useState<{revision:string;start_date:string;commercial:{total_fee:number};stages:Array<{id:string;name:string;parent_stage_id:string|null;sort_order:number;start_date:string;end_date:string;baseline_start_date?:string;baseline_end_date?:string;working_days?:number;hours?:number;fee?:number}>;allocations:Array<{id:string;resource_name:string;hours_per_day:number;start_date:string;end_date:string}>;payments:Array<{id:string;label:string;amount:number;expected_invoice_date:string|null;expected_payment_date:string|null}>}|null>(null);
  const [conversionPreviewPending,setConversionPreviewPending]=useState(false);
  const previewConversion=async()=>{
    if(!conversionStart)return;setConversionPreviewPending(true);
    try {const {data,error}=await supabase.rpc("pm_quote_conversion_preview",{_quote:quoteId,_start:conversionStart});if(error)throw error;setConversionPreview(data as unknown as NonNullable<typeof conversionPreview>);}
    catch(e){toast.error(t(translateError((e as Error).message)));}finally {setConversionPreviewPending(false);}
  };
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [buildSettingsOpen, setBuildSettingsOpen] = useState(false);

  const handleConvert = () => {
    if (!quote) return;
    if (quote.pm_project_id) {
      // Already exists — go straight to it without a confirm prompt.
      convert.mutate();
      return;
    }
    setConvertOpen(true);
  };

  // Loaders used for stepper completion ticks and (historically) the
  // pre-conversion warnings banner. The banner now lives in the Publish
  // step only, so we keep the queries (cheap, cached) but no longer
  // compute warnings inline.
  // Hooks must run before any early return: never gate them on `quote`.
  const stagesQ = useQuoteStages(quoteId);
  const allocsQ = useQuoteAllocations(quoteId);
  const externalQ = useQuoteExternalServices(quoteId);
  const paymentQ = useQuotePaymentSchedule(quoteId);
  const scheduleSync = useSyncQuotePaymentScheduleFromGantt(quoteId);
  void rollupQuote; // keep import — used by conversion mutation above


  // Linear workflow state — orchestration only. All underlying tabs and
  // components below are preserved unchanged; the stepper just filters
  // which secondary tabs are surfaced per step.
  const [step, setStep] = useState<QuoteStep>(() => requestedStep ?? readSavedQuoteStep(quoteId));
  const [activeTab, setActiveTab] = useState<string>("overview");

  useEffect(() => {
    setStep(requestedStep ?? readSavedQuoteStep(quoteId));
  }, [quoteId, requestedStep]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(quoteWorkspaceStepKey(quoteId), step);
  }, [quoteId, step]);

  // Sync the active tab whenever the workflow step changes so the visible
  // tab triggers and the rendered TabsContent stay consistent. Without
  // this, switching to "content" leaves the Tabs root on "overview" — a
  // hidden trigger — and nothing renders.
  const projectCategory = normalizeQuoteCategory(quote?.quote_category);
  const stepIsProject = projectCategory === "project";
  useEffect(() => {
    if (step === "estimate") {
      // Planning first: the Gantt is the real starting point; the calculator
      // stays available as the second tab.
      setActiveTab(stepIsProject ? "planning" : "overview");
    } else if (step === "content") {
      setActiveTab("proposal");
    }
  }, [step, stepIsProject]);



  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!quote) return <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>;

  const status = QUOTE_STATUSES.find((s) => s.value === quote.quote_status);
  void status;
  // canConvert lives on QuoteWorkflowActions in the header now.
  // Signature is the checkpoint between "approved" and "project".
  const isSigned = !!signatureQ.data?.isSigned;
  const lifecycle = resolveQuoteLifecycle({
    status: quote.quote_status,
    signedAt: signatureQ.data?.signedAt ?? null,
    hasProject: !!quote.pm_project_id,
  });
  const pricingMultiplier = Number(form.pricing_multiplier) || 1;
  const category = normalizeQuoteCategory(quote.quote_category);
  const isProject = category === "project";
  // Phase 1 lock — set by DB trigger when status=approved + project linked.
  const lockMeta = quote as unknown as { is_locked?: boolean; locked_project_id?: string | null };
  const isLocked = !!lockMeta.is_locked;
  const lockedProjectId = lockMeta.locked_project_id ?? null;

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
    publish: !!quote.pm_project_id || !!signatureQ.data?.isSigned,
  } as const;

  // Per-step visible secondary tabs. All TabsContent below remain mounted
  // in the DOM (Radix Tabs only renders the active one); we just hide the
  // triggers that are not part of the current step.
  // Project quotes no longer expose the "Tempo" tab — proposal type is set
  // at quote-creation time and cannot be switched from within a Standard
  // Project workspace. The two time-based proposal types keep the tab as
  // their primary fee configuration surface. Phase-level retainer billing
  // is intentionally deferred and is NOT a proposal-type switch.
  // Retainer quotes never bill external services and never use stage milestones.
  // They keep Planning (monthly template editor) and Payment (auto-generated
  // monthly schedule) but drop the External Services and generator clutter.
  const isRetainer = category === "retainer";
  const estimateTabs = isRetainer
    ? ["overview", "planning", "payment", "financial"]
    : isProject
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
          <InlineEditableTitle
            value={quote.titulo}
            onSave={async (titulo: string) => {
              const { error } = await supabase
                .from("fee_proposals")
                .update({ titulo })
                .eq("id", quoteId);
              if (error) throw error;
              setForm((f) => ({ ...f, titulo }));
              qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
              qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp"] });
            }}
            className="text-2xl font-semibold tracking-tight"
          />
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
          <QuoteStatusRail state={lifecycle} />
          <QuoteWorkflowActions
            quoteId={quoteId}
            status={quote.quote_status}
            hasAccount={!!quote.account_id}
            hasProject={!!quote.pm_project_id}
            companyId={quote.company_id ?? null}
            defaultContactId={quote.contact_id ?? null}
            onConvert={handleConvert}
            isConverting={convert.isPending}
            isSigned={isSigned}
            onGoToSignature={() => setStep("publish")}
            canOverrideSignature={isAdmin}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" title={uiI18n.t("common:moreActions")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(isProject || isRetainer) && (
                <DropdownMenuItem
                  onSelect={scheduleSync.syncFromGantt}
                  disabled={scheduleSync.disabled || isLocked}
                >
                  <RefreshCw
                    className={cn("mr-2 h-3.5 w-3.5", scheduleSync.isPending && "animate-spin")}
                  />
                  {t("workspace.payment.headerUpdate")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => reviseQuote.mutate()}
                disabled={reviseQuote.isPending}
              >
                <Copy className="mr-2 h-3.5 w-3.5" />  {uiI18n.t("crm:quoteEditor.createEditableRevision")} </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRevisionsOpen(true)}>
                 {uiI18n.t("crm:quoteEditor.revisionHistory")} </DropdownMenuItem>

              <DropdownMenuItem
                disabled={isLocked && !isAdmin}
                onSelect={() => setBuildSettingsOpen(true)}
              >
                <Settings className="mr-2 h-3.5 w-3.5" />  {uiI18n.t("crm:quoteEditor.constructionSettings")} </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSaveTemplateOpen(true)}>
                {t("templates.actions.saveAs")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setDeleteOpen(true)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <QuoteRevisionsButton
            quoteId={quoteId}
            open={revisionsOpen}
            onOpenChange={setRevisionsOpen}
            hideTrigger
          />
          <QuoteBuildSettingsDialog
            quoteId={quoteId}
            disabled={isLocked && !isAdmin}
            open={buildSettingsOpen}
            onOpenChange={setBuildSettingsOpen}
            hideTrigger
          />

        </div>
      </div>

      <QuoteLockGuard quoteId={quoteId} />


      <fieldset disabled={isLocked && !isAdmin} className="contents">

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
          pricingMultiplier={pricingMultiplier}
          title={form.titulo || quote.titulo}
          description={form.proposal_description || quote.proposal_description || quote.notas}
          clientName={quote.company?.nome ?? null}
          accountName={quote.account?.name ?? null}
          quoteType={quote.quote_type ?? "standard_project"}
          quoteCategory={quote.quote_category}
          ontologyFamilyCode={(quote as unknown as { ontology_family_code?: string | null }).ontology_family_code ?? null}
          quoteStatus={quote.quote_status}
          isSigned={isSigned}
          canOverrideSignature={isAdmin}
          onConvert={handleConvert}
          isConverting={convert.isPending}
          onEditEstimate={() => setStep("estimate")}
          onEditContent={() => setStep("content")}
        />
      )}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className={cn("w-full", step === "publish" && "hidden")}
      >
        <TabsList className={cn("no-print", step === "content" && "hidden")}>
          {/* Planning (Gantt + stages) leads — the estimate is built here and
              the calculator sits right after it. External services and Payment
              schedule are project-only. */}
          {(isProject || isRetainer) && visibleTabs.includes("planning") && (
            <TabsTrigger value="planning">{t("workspace.tabs.planning")}</TabsTrigger>
          )}
          {visibleTabs.includes("overview") && (
            <TabsTrigger value="overview">{t("workspace.tabs.overview")}</TabsTrigger>
          )}
          {/* Time-based tab is always shown — for project quotes the optional
              retainer/consultancy add-on figures live there, and for
              consultancy quotes it is the primary fee configuration tab. */}
          {visibleTabs.includes("time-based") && (
            <TabsTrigger value="time-based">{t("workspace.tabs.timeBased")}</TabsTrigger>
          )}

          {step === "estimate" && (isProject || isRetainer) && (
            <>
              <TabsTrigger value="architecture"> {uiI18n.t("crm:workspace.payment.archNetCol")} </TabsTrigger>
              <TabsTrigger value="consultants"> {uiI18n.t("crm:workspace.payment.archSuppliersCol")} </TabsTrigger>
              <TabsTrigger value="incoming"> {uiI18n.t("common:inflow")} </TabsTrigger>
              <TabsTrigger value="outgoing"> {uiI18n.t("common:outflow")} </TabsTrigger>
              <TabsTrigger value="construction-assistance"> {uiI18n.t("crm:quoteEditor.travelExpenses")} </TabsTrigger>
              <TabsTrigger value="billable-rates"> {uiI18n.t("crm:quoteEditor.billableHourly")} </TabsTrigger>
            </>
          )}



          {(isProject || isRetainer) && visibleTabs.includes("payment") && (
            <TabsTrigger value="payment">{t("workspace.tabs.payment")}</TabsTrigger>
          )}
          {visibleTabs.includes("financial") && (
            <TabsTrigger value="financial">{t("workspace.tabs.financial")}</TabsTrigger>
          )}
          {/* Proposal tab trigger hidden — content step renders the proposal
              builder directly without a redundant tab. */}
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

          {/* Ontology bootstrap — intelligent defaults for stages, dependencies
              and payment schedule. Sits beneath the calculator so the user
              flow stays: 1) compute fee → 2) generate planning skeleton.
              Manual edits on existing rows are always preserved. */}
          {isProject && (
            <div className="mt-4">
              <QuoteOntologyBootstrapCard
                quoteId={quoteId}
                initialFamilyCode={(quote as unknown as { ontology_family_code?: string | null }).ontology_family_code ?? null}
                initialPresetCode={(quote as unknown as { ontology_preset_code?: string | null }).ontology_preset_code ?? null}
                initialDeliveryMode={(quote as unknown as { ontology_delivery_mode?: string | null }).ontology_delivery_mode ?? null}
                initialBootstrappedAt={(quote as unknown as { ontology_bootstrapped_at?: string | null }).ontology_bootstrapped_at ?? null}
              />
            </div>
          )}

          <div className="mt-4">
            <QuoteCreateContractCard quoteId={quoteId} quoteStatus={quote.quote_status} />
          </div>
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
        {(isProject || isRetainer) && (
          <>
            <TabsContent value="planning" className="mt-4">
              <QuotePlanningTab quoteId={quoteId} pricingMultiplier={pricingMultiplier} isRetainer={isRetainer} />
            </TabsContent>

            <TabsContent value="architecture" className="mt-4 space-y-4">
              <QuotePaymentScheduleTab quoteId={quoteId} compositionOnly />
              <ArchitectureFinancialBreakdown quoteId={quoteId} />
            </TabsContent>

            <TabsContent value="consultants" className="mt-4 space-y-4">
              <QuotePaymentScheduleTab quoteId={quoteId} consultantsOnly />
              <QuoteExternalServicesTab quoteId={quoteId} />
            </TabsContent>
            <TabsContent value="incoming" className="mt-4">
              <QuotePaymentScheduleTab quoteId={quoteId} incomingOnly />
            </TabsContent>
            <TabsContent value="outgoing" className="mt-4">
              <QuotePaymentScheduleTab quoteId={quoteId} outgoingOnly />
            </TabsContent>
            <TabsContent value="construction-assistance" className="mt-4">
              <QuoteConstructionAssistanceTab quoteId={quoteId} />
            </TabsContent>
            <TabsContent value="billable-rates" className="mt-4">
              <QuoteBillableRatesTab quoteId={quoteId} />
            </TabsContent>




            <TabsContent value="payment" className="mt-4">
              <QuotePaymentScheduleTab quoteId={quoteId} />
            </TabsContent>
          </>
        )}
        <TabsContent value="financial" className="mt-4">
          <QuoteFinancialSummaryTab quoteId={quoteId} pricingMultiplier={pricingMultiplier} />
        </TabsContent>
        <TabsContent value="proposal" className={cn(step === "content" ? "mt-0" : "mt-4")}>
          <QuoteProposalComposerEmbed
            quoteId={quoteId}
            quoteTitle={form.titulo || quote.titulo}
          />
        </TabsContent>
      </Tabs>

      </fieldset>

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
          <div className="space-y-2">
            <Label htmlFor="conversion-start">{t("projects:gantt.relative.convertStart")}</Label>
            <Input id="conversion-start" type="date" value={conversionStart} onChange={e=>{setConversionStart(e.target.value);setConversionPreview(null);}}/>
            <Button variant="outline" onClick={previewConversion} disabled={!conversionStart||conversionPreviewPending}>{t("projects:gantt.relative.convertPreview")}</Button>
            {conversionPreview && <div className="max-h-72 overflow-auto text-xs"><div className="flex flex-wrap justify-between gap-2 font-medium"><span>{conversionPreview.start_date}</span><span>{t("glossary:financial.fee")} · {new Intl.NumberFormat(uiI18n.language,{style:"currency",currency:"EUR"}).format(conversionPreview.commercial.total_fee)}</span></div>{numberStages(conversionPreview.stages).map(({stage:s,number})=><div key={s.id} className="border-b border-border py-2"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{formatStageLabel(s,number)}</span><span>{s.working_days ?? "—"} {t("projects:gantt.wdShort")} · {new Intl.NumberFormat(uiI18n.language,{maximumFractionDigits:1}).format(s.hours ?? 0)} {t("common:hours")} · {new Intl.NumberFormat(uiI18n.language,{style:"currency",currency:"EUR"}).format(s.fee ?? 0)}</span></div><div className="flex flex-wrap justify-between gap-2 text-muted-foreground"><span>{t("projects:gantt.relative.previewBaseline")}: {s.baseline_start_date} → {s.baseline_end_date}</span><span>{t("projects:gantt.relative.previewLive")}: {s.start_date} → {s.end_date}</span></div>{s.baseline_end_date && s.baseline_end_date!==s.end_date && <div className="font-medium text-amber-700 dark:text-amber-400">{t("projects:gantt.relative.previewShift",{count:Math.round((Date.parse(s.end_date)-Date.parse(s.baseline_end_date))/86400000)})}</div>}</div>)}{conversionPreview.allocations.map((a,i)=><div key={`${a.id}:${i}`} className="flex flex-wrap justify-between gap-2 py-1"><span>{a.resource_name} · {new Intl.NumberFormat(uiI18n.language,{maximumFractionDigits:2}).format(a.hours_per_day)} {t("common:hours")}</span><span>{a.start_date} → {a.end_date}</span></div>)}{conversionPreview.payments && <ConversionInvoicePreview quoteId={quoteId} payments={conversionPreview.payments}/>}</div>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={!conversionPreview||convert.isPending}
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
