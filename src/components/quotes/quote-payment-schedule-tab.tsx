/**
 * Quote Payment Schedule tab — planned forecast payments.
 *
 * Phase 6 additions:
 * - Generator buttons (milestones / thirds / monthly) with manual-override safety.
 * - Per-row "manual" badge so the user can see which rows are protected.
 * - Editing or marking-edited a row sets manual_override = true.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, ArrowUp, ArrowDown, Wand2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  useQuotePaymentSchedule,
  useUpsertQuotePaymentItem,
  useDeleteQuotePaymentItem,
  useApplyPaymentGenerator,
} from "@/lib/quotes/use-quote-payment-schedule";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { rollupQuote } from "@/lib/quotes/financial-rollups";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  generateStageMilestones,
  generateThirds,
  generateMonthly,
  generateByStageBilling,
  generateArchitectureWithConsultants,
  computeStageFees,
  resolveScheduleItemAmount,
  applyPaymentDefaults,
  DEFAULT_STAGE_MILESTONE_OPTIONS,
  type GeneratorKind,
  type GeneratorItem,
  type PaymentDefaults,
} from "@/lib/quotes/payment-generators";
import { rolledUpBillableFees } from "@/lib/quotes/stage-billing";
import {
  QUOTE_PAYMENT_TRIGGERS, QUOTE_PAYMENT_AMOUNT_TYPES,
  type QuotePaymentTrigger, type QuotePaymentAmountType,
} from "@/lib/quotes/types";
import { formatEUR } from "@/lib/crm/types";
import { PaymentScheduleProposalView } from "./payment-schedule-proposal-view";

function AutoTextarea({
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  autoFocus,
  className,
  minHeight = 72,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [value, minHeight]);
  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className}
      style={{ minHeight, resize: "vertical", overflow: "hidden" }}
    />
  );
}

function InlineLabelEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
    setEditing(false);
  };
  if (editing) {
    return (
      <AutoTextarea
        value={draft}
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        autoFocus
        className="text-sm"
        minHeight={70}
      />
    );
  }
  return (
    <button
      type="button"
      onDoubleClick={() => setEditing(true)}
      onClick={() => setEditing(true)}
      className="group flex w-full items-start gap-1 text-left rounded hover:bg-muted/50 px-1 py-0.5 -mx-1"
      title="Editar etiqueta"
    >
      <span className="whitespace-pre-wrap break-words flex-1">{value}</span>
      <Pencil className="h-3 w-3 mt-1 opacity-0 group-hover:opacity-60 shrink-0" />
    </button>
  );
}

export function QuotePaymentScheduleTab({ quoteId, compositionOnly = false, consultantsOnly = false, incomingOnly = false, outgoingOnly = false }: { quoteId: string; compositionOnly?: boolean; consultantsOnly?: boolean; incomingOnly?: boolean; outgoingOnly?: boolean }) {
  const { t } = useTranslation("crm");
  const itemsQ = useQuotePaymentSchedule(quoteId);
  const stagesQ = useQuoteStages(quoteId);
  const allocationsQ = useQuoteAllocations(quoteId);
  const externalsQ = useQuoteExternalServices(quoteId);
  const quoteQ = useQuery({
    queryKey: ["fee-proposal-summary", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: { pricing_multiplier: number | null; valor: number | null; quote_category: string | null; default_vat_rate: number | null; default_payment_terms: string | null; first_payment_terms: string | null } | null; error: { message: string } | null }> } } } })
        .from("fee_proposals")
        .select("pricing_multiplier,valor,quote_category,default_vat_rate,default_payment_terms,first_payment_terms")
        .eq("id", quoteId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const upsert = useUpsertQuotePaymentItem(quoteId);
  const remove = useDeleteQuotePaymentItem(quoteId);
  const applyGen = useApplyPaymentGenerator(quoteId);
  const items = itemsQ.data ?? [];
  const stages = stagesQ.data ?? [];
  const allocations = allocationsQ.data ?? [];
  const externals = externalsQ.data ?? [];
  const pricingMultiplier = Number(quoteQ.data?.pricing_multiplier ?? 1) || 1;
  const defaultVatRate = Number(quoteQ.data?.default_vat_rate ?? 23) || 23;
  const paymentDefaults: PaymentDefaults = {
    vatRate: defaultVatRate,
    defaultTerms: quoteQ.data?.default_payment_terms ?? "30 (trinta) dias de calendário",
    firstPaymentTerms: quoteQ.data?.first_payment_terms ?? "Pronto pagamento",
  };
  const rollup = rollupQuote({
    allocations,
    externalServices: externals,
    pricingMultiplier,
    category: (quoteQ.data?.quote_category as "project" | "time_based" | "retainer" | "consultancy" | undefined) ?? undefined,
  });
  const totalFee = rollup.totalFee || Number(quoteQ.data?.valor ?? 0) || 0;
  const leafStageFees = computeStageFees(stages, allocations, externals, pricingMultiplier);
  // Roll children up into their parent bars (calculated/fixed budget mode),
  // then merge so per-item amount resolution can look up either map.
  const topLevelStageFees = rolledUpBillableFees(stages, leafStageFees);
  const stageFees = { ...leafStageFees, ...topLevelStageFees };
  const contractTotal = Object.values(topLevelStageFees).reduce((sum, value) => sum + value, 0) || totalFee;

  // -- Supplier resolution from Gantt stages -------------------------------
  // Stages now carry three supplier signals (inheritable from parents):
  //   * is_self            → our own work (architecture credit, no outflow)
  //   * supplier_id        → FK to pm_suppliers master directory
  //   * supplier_placeholder → free-text label when supplier isn't yet known
  // If none are set, the stage falls back to "self" (no outflow generated).
  type SupplierStage = typeof stages[number] & {
    parent_stage_id?: string | null;
    supplier_id?: string | null;
    supplier_placeholder?: string | null;
    is_self?: boolean | null;
    // legacy — kept readable while old data lingers
    supplier_company_id?: string | null;
    budget?: number | null;
    budget_mode?: string | null;
  };

  // Fetch pm_suppliers names for any stage referencing one.
  const stageSupplierIds = Array.from(
    new Set(
      stages
        .map((s) => (s as SupplierStage).supplier_id)
        .filter((x): x is string => !!x),
    ),
  );
  const stageSuppliersQ = useQuery({
    queryKey: ["stage-pm-suppliers", quoteId, stageSupplierIds.sort().join(",")],
    enabled: stageSupplierIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { in: (c: string, v: string[]) => Promise<{ data: { id: string; name: string }[] | null; error: { message: string } | null }> } } })
        .from("pm_suppliers")
        .select("id,name")
        .in("id", stageSupplierIds);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const stagePmSuppliers = stageSuppliersQ.data ?? [];
  const stageSupplierName = (sid: string) =>
    stagePmSuppliers.find((c) => c.id === sid)?.name ?? "Supplier";

  // Fetch companies for legacy `supplier_company_id` on stages (A2P, A400, etc.)
  const stageCompanyIds = Array.from(
    new Set(
      stages
        .map((s) => (s as SupplierStage).supplier_company_id)
        .filter((x): x is string => !!x),
    ),
  );
  const stageCompaniesQ = useQuery({
    queryKey: ["stage-companies", quoteId, stageCompanyIds.sort().join(",")],
    enabled: stageCompanyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { in: (c: string, v: string[]) => Promise<{ data: { id: string; nome: string }[] | null; error: { message: string } | null }> } } })
        .from("companies")
        .select("id,nome")
        .in("id", stageCompanyIds);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const stageCompaniesList = stageCompaniesQ.data ?? [];
  const stageCompanyName = (cid: string) =>
    stageCompaniesList.find((c) => c.id === cid)?.nome ?? "Supplier";

  const supplierLookupReady =
    (stageSupplierIds.length === 0 || stageSuppliersQ.isSuccess) &&
    (stageCompanyIds.length === 0 || stageCompaniesQ.isSuccess);

  // Walk up the parent chain to inherit supplier intent.
  // Returns the closest non-empty signal, or null = default self.
  type InheritedSupplier =
    | { kind: "self" }
    | { kind: "supplier"; supplierId: string }
    | { kind: "company"; companyId: string }
    | { kind: "placeholder"; label: string };
  const stageById = new Map(stages.map((s) => [s.id, s as SupplierStage]));
  const childrenByParent = new Map<string, SupplierStage[]>();
  for (const st of stages as SupplierStage[]) {
    if (!st.parent_stage_id) continue;
    const arr = childrenByParent.get(st.parent_stage_id) ?? [];
    arr.push(st);
    childrenByParent.set(st.parent_stage_id, arr);
  }
  const childCount = (id: string) =>
    (childrenByParent.get(id) ?? []).length;
  const inheritedSupplier = (stage: SupplierStage): InheritedSupplier | null => {
    let current: SupplierStage | undefined = stage;
    while (current) {
      if (current.is_self) return { kind: "self" };
      if (current.supplier_id) return { kind: "supplier", supplierId: current.supplier_id };
      if (current.supplier_company_id) return { kind: "company", companyId: current.supplier_company_id };
      const ph = (current.supplier_placeholder ?? "").trim();
      if (ph) return { kind: "placeholder", label: ph };
      current = current.parent_stage_id ? stageById.get(current.parent_stage_id) : undefined;
    }
    return null; // = default self
  };
  // Synthetic key used to group outflows (real FKs vs free-text labels).
  const supplierKey = (s: InheritedSupplier) =>
    s.kind === "supplier" ? `pm:${s.supplierId}`
      : s.kind === "company" ? `co:${s.companyId}`
      : s.kind === "placeholder" ? `ph:${s.label.toLowerCase()}`
      : "self";
  const hasFixedAncestorSameSupplier = (stage: SupplierStage, key: string) => {
    let current = stage.parent_stage_id ? stageById.get(stage.parent_stage_id) : undefined;
    while (current) {
      const inh = inheritedSupplier(current);
      if (
        inh && inh.kind !== "self" && supplierKey(inh) === key &&
        childCount(current.id) > 0 &&
        current.budget_mode === "fixed" &&
        Number(current.budget ?? 0) > 0
      ) return true;
      current = current.parent_stage_id ? stageById.get(current.parent_stage_id) : undefined;
    }
    return false;
  };
  const stageHasSupplierExternal = (stageId: string): boolean => {
    const direct = externals.some((es) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const esAny = es as any;
      if (esAny.stage_id !== stageId) return false;
      return !!(
        esAny.supplier_company_id ||
        esAny.supplier_id ||
        esAny.supplier_placeholder ||
        es.supplier?.id
      );
    });
    if (direct) return true;
    return (childrenByParent.get(stageId) ?? []).some((child) => stageHasSupplierExternal(child.id));
  };
  const stageOnlyOutflows = stages
    .map((stage) => {
      const s = stage as SupplierStage;
      const inh = inheritedSupplier(s);
      if (!inh || inh.kind === "self") return null;
      // If the stage/subtree already has explicit supplier external-service
      // rows, those rows are the source of truth. Do not add a second synthetic
      // supplier commitment from the parent/child stage budget.
      if (stageHasSupplierExternal(s.id)) return null;
      const key = supplierKey(inh);
      if (hasFixedAncestorSameSupplier(s, key)) return null;
      const children = childCount(s.id);
      const ownBudget = Number(s.budget ?? 0) || 0;
      const mode = (s.budget_mode ?? "calculated") as "calculated" | "fixed";
      if (children > 0 && !(mode === "fixed" && ownBudget > 0)) return null;
      const amount = mode === "fixed" && ownBudget > 0
        ? ownBudget
        : Number(stageFees[s.id] ?? 0) || ownBudget;
      if (amount <= 0) return null;
      const displayName =
        inh.kind === "supplier" ? stageSupplierName(inh.supplierId)
        : inh.kind === "company" ? stageCompanyName(inh.companyId)
        : inh.label;

      return {
        id: `stage-supplier-${s.id}`,
        quote_id: quoteId,
        stage_id: s.id,
        supplier_id: inh.kind === "supplier" ? inh.supplierId : null,
        supplier_company_id: inh.kind === "company" ? inh.companyId : null,
        supplier_placeholder: inh.kind === "placeholder" ? inh.label : null,
        description: s.name,
        quantity: 1,
        purchase_price: amount,
        sale_price: amount,
        markup_type: "amount",
        markup_value: 0,
        supplier:
          inh.kind === "supplier" ? { id: inh.supplierId, name: displayName }
          : inh.kind === "company" ? { id: inh.companyId, name: displayName }
          : null,
      } as unknown as typeof externals[number];

    })
    .filter((row): row is typeof externals[number] => !!row);
  const effectiveExternals = [...externals, ...stageOnlyOutflows];


  // Supplier names for grouped outflow rows in the proposal view.
  // Outflows can carry either a company FK (legacy) or a pm_suppliers FK (new).
  const supplierIds = Array.from(
    new Set(
      items
        .map((it) => (it as unknown as { supplier_company_id?: string | null }).supplier_company_id)
        .filter((x): x is string => !!x),
    ),
  );
  const pmSupplierItemIds = Array.from(
    new Set(
      items
        .map((it) => (it as unknown as { supplier_id?: string | null }).supplier_id)
        .filter((x): x is string => !!x),
    ),
  );
  const suppliersQ = useQuery({
    queryKey: ["payment-schedule-suppliers", quoteId, supplierIds.sort().join(",")],
    enabled: supplierIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { in: (c: string, v: string[]) => Promise<{ data: { id: string; nome: string }[] | null; error: { message: string } | null }> } } })
        .from("companies")
        .select("id,nome")
        .in("id", supplierIds);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const pmSuppliersItemsQ = useQuery({
    queryKey: ["payment-schedule-pm-suppliers", quoteId, pmSupplierItemIds.sort().join(",")],
    enabled: pmSupplierItemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { in: (c: string, v: string[]) => Promise<{ data: { id: string; name: string }[] | null; error: { message: string } | null }> } } })
        .from("pm_suppliers")
        .select("id,name")
        .in("id", pmSupplierItemIds);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const suppliers = [
    ...(suppliersQ.data ?? []).map((c) => ({ id: c.id, name: c.nome })),
    ...(pmSuppliersItemsQ.data ?? []).map((c) => ({ id: c.id, name: c.name })),
  ];



  const scheduleTotal = items
    .filter((it) => (it.direction ?? "inflow") === "inflow")
    .reduce(
    (sum, it) =>
      sum +
      resolveScheduleItemAmount(
        {
          amount_type: it.amount_type,
          amount_value: Number(it.amount_value ?? 0),
          trigger_type: it.trigger_type,
          stage_id: it.stage_id,
        },
        contractTotal,
        stageFees,
      ),
    0,
  );
  const totalMismatch =
    contractTotal > 0 && Math.abs(scheduleTotal - contractTotal) > 0.5;

  const [draft, setDraft] = useState({
    label: "",
    trigger_type: "stage_end" as QuotePaymentTrigger,
    stage_id: "",
    amount_type: "percent" as QuotePaymentAmountType,
    amount_value: "0",
    expected_invoice_date: "",
    expected_payment_date: "",
  });

  // Stage-milestone generator options (architecture fee proposal defaults).
  const [milestoneOpts, setMilestoneOpts] = useState({
    downPaymentEnabled: DEFAULT_STAGE_MILESTONE_OPTIONS.downPaymentEnabled,
    downPaymentPercent: String(DEFAULT_STAGE_MILESTONE_OPTIONS.downPaymentPercent),
    stageStartPercent: String(DEFAULT_STAGE_MILESTONE_OPTIONS.stageStartPercent),
    stageEndPercent: String(DEFAULT_STAGE_MILESTONE_OPTIONS.stageEndPercent),
    deductDownPaymentFromStages:
      DEFAULT_STAGE_MILESTONE_OPTIONS.deductDownPaymentFromStages ?? false,
    paymentTermsDays: "",
  });

  const stageRequired =
    draft.trigger_type === "stage_start" || draft.trigger_type === "stage_end";
  const dateRequired = draft.trigger_type === "manual_date";

  // Auto-seed the payment schedule from the Gantt stages the first time the
  // tab is opened on an empty quote. Uses each stage's billing_model so the
  // schedule mirrors the planning tab without requiring a manual click.
  const autoSeededRef = useRef(false);
  useEffect(() => {
    if (autoSeededRef.current) return;
    if (itemsQ.isLoading || stagesQ.isLoading || !supplierLookupReady) return;
    if (items.length > 0) {
      autoSeededRef.current = true;
      return;
    }
    if (stages.length === 0) return;
    if (applyGen.isPending) return;
    autoSeededRef.current = true;
    const generated = applyPaymentDefaults(
      generateByStageBilling(stages, stageFees, {
        downPaymentPercent: milestoneOpts.downPaymentEnabled
          ? Number(milestoneOpts.downPaymentPercent) || 0
          : 0,
        deductDownPaymentFromStages: milestoneOpts.deductDownPaymentFromStages,
        externalServices: effectiveExternals,

        paymentOffsetDays: Number(milestoneOpts.paymentTermsDays) || 30,
      }),
      paymentDefaults,
    );
    if (generated.length === 0) return;
    applyGen.mutate({ generator: "by_stage_billing", items: generated });
  }, [itemsQ.isLoading, stagesQ.isLoading, supplierLookupReady, items.length, stages, stageFees, applyGen]);

  // Manual "Update from Gantt" button: regenerate the schedule from current
  // stage budgets/dates while preserving any rows marked manual_override.
  // This is an explicit full refresh: it replaces all non-manual generated
  // rows so stale supplier duplicates are removed instead of accumulated.
  const syncFromGantt = async () => {
    try {
      await runGenerator("by_stage_billing", { replaceAll: true });
      toast.success(t("workspace.payment.synced", { defaultValue: "Billing schedule updated from the Gantt" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };


  const handleAdd = async () => {
    if (!draft.label.trim()) return toast.error(t("workspace.payment.errorLabel"));
    if (stageRequired && !draft.stage_id)
      return toast.error(t("workspace.payment.errorStage"));
    if (dateRequired && !draft.expected_invoice_date)
      return toast.error(t("workspace.payment.errorDate"));
    try {
      await upsert.mutateAsync({
        quote_id: quoteId,
        label: draft.label.trim(),
        trigger_type: draft.trigger_type,
        stage_id: stageRequired ? draft.stage_id : null,
        amount_type: draft.amount_type,
        amount_value: Number(draft.amount_value) || 0,
        expected_invoice_date: draft.expected_invoice_date || null,
        expected_payment_date: draft.expected_payment_date || null,
        sort_order: items.length,
      });
      setDraft({
        label: "", trigger_type: "stage_end", stage_id: "",
        amount_type: "percent", amount_value: "0",
        expected_invoice_date: "", expected_payment_date: "",
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[idx];
    const b = items[target];
    upsert.mutate({ id: a.id, sort_order: b.sort_order });
    upsert.mutate({ id: b.id, sort_order: a.sort_order });
  };

  const runGenerator = async (kind: GeneratorKind, opts: { replaceAll?: boolean } = {}) => {
    let generated: GeneratorItem[] = [];
    if (kind === "milestones") {
      const dp = Number(milestoneOpts.downPaymentPercent) || 0;
      const startPct = Number(milestoneOpts.stageStartPercent) || 0;
      const endPct = Number(milestoneOpts.stageEndPercent) || 0;
      if (dp < 0) {
        toast.error(t("workspace.payment.errorDownPayment"));
        return;
      }
      if (Math.round((startPct + endPct) * 100) / 100 !== 100) {
        toast.error(t("workspace.payment.errorStageSplit"));
        return;
      }
      const terms = Number(milestoneOpts.paymentTermsDays);
      generated = generateStageMilestones(stages, {
        downPaymentEnabled: milestoneOpts.downPaymentEnabled,
        downPaymentPercent: dp,
        stageStartPercent: startPct,
        stageEndPercent: endPct,
        deductDownPaymentFromStages: milestoneOpts.deductDownPaymentFromStages,
        paymentTermsDays: Number.isFinite(terms) && terms > 0 ? terms : null,
        stageFees,
        totalFee: contractTotal,
      });
    } else if (kind === "thirds") {
      generated = generateThirds(stages);
    } else if (kind === "monthly") {
      generated = generateMonthly(stages);
    } else if (kind === "by_stage_billing") {
      generated = generateByStageBilling(stages, stageFees, {
        downPaymentPercent: milestoneOpts.downPaymentEnabled
          ? Number(milestoneOpts.downPaymentPercent) || 0
          : 0,
        deductDownPaymentFromStages: milestoneOpts.deductDownPaymentFromStages,
        externalServices: effectiveExternals,
        paymentOffsetDays: Number(milestoneOpts.paymentTermsDays) || 30,
      });
    } else if (kind === "architecture_with_consultants") {
      generated = generateArchitectureWithConsultants(stages, effectiveExternals, stageFees, {

        downPaymentPercent: Number(milestoneOpts.downPaymentPercent) || 0,
        paymentOffsetDays: Number(milestoneOpts.paymentTermsDays) || 30,
      });
    }

    generated = applyPaymentDefaults(generated, paymentDefaults);


    if (generated.length === 0) {
      toast.error(t("workspace.payment.generatorEmpty"));
      return;
    }
    const protectedCount = items.filter((it) => it.manual_override).length;
    try {
      await applyGen.mutateAsync({ generator: kind, items: generated, replaceAll: opts.replaceAll });
      toast.success(
        protectedCount > 0
          ? t("workspace.payment.generatorAppliedKeep", { count: protectedCount })
          : t("workspace.payment.generatorApplied"),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (compositionOnly || consultantsOnly || incomingOnly) {
    return (
      <PaymentScheduleProposalView
        items={items}
        stages={stages}
        totalFee={contractTotal}
        stageFees={stageFees}
        suppliers={suppliers}
        defaultVatRate={defaultVatRate}
        compositionOnly={compositionOnly}
        consultantsOnly={consultantsOnly}
        incomingOnly={incomingOnly}
      />
    );
  }

  return (
    <div className="space-y-6">

      {/* Quote-level billing defaults */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Predefinições de faturação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label className="text-xs">IVA padrão (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={defaultVatRate}
              onBlur={async (e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v) || v < 0 || v > 100) return;
                await (supabase as unknown as { from: (t: string) => { update: (p: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: { message: string } | null }> } } })
                  .from("fee_proposals")
                  .update({ default_vat_rate: v })
                  .eq("id", quoteId);
                quoteQ.refetch();
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Condições padrão</Label>
            <Input
              defaultValue={paymentDefaults.defaultTerms}
              onBlur={async (e) => {
                await (supabase as unknown as { from: (t: string) => { update: (p: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: { message: string } | null }> } } })
                  .from("fee_proposals")
                  .update({ default_payment_terms: e.target.value })
                  .eq("id", quoteId);
                quoteQ.refetch();
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Condições do primeiro pagamento</Label>
            <Input
              defaultValue={paymentDefaults.firstPaymentTerms}
              onBlur={async (e) => {
                await (supabase as unknown as { from: (t: string) => { update: (p: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: { message: string } | null }> } } })
                  .from("fee_proposals")
                  .update({ first_payment_terms: e.target.value })
                  .eq("id", quoteId);
                quoteQ.refetch();
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Global update action — visible at the top of the payment schedule */}
      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
        <div className="text-xs text-muted-foreground">
          {t("workspace.payment.globalUpdateHint", {
            defaultValue:
              "Regenerate the full billing schedule from the current Gantt (budgets, dates, suppliers). Manual rows are preserved.",
          })}
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={syncFromGantt}
          disabled={upsert.isPending || applyGen.isPending}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("workspace.payment.globalUpdate", { defaultValue: "Update schedule from Gantt" })}
        </Button>
      </div>

      {/* Proposal-style read-only layout (mirrors printed proposal) */}
      <PaymentScheduleProposalView
        items={items}
        stages={stages}
        totalFee={contractTotal}
        stageFees={stageFees}
        suppliers={suppliers}
        defaultVatRate={defaultVatRate}
      />


      <details className="rounded-md border bg-muted/10">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
          Editor avançado — linhas de faturação (rever / ajustar IVA, condições, datas)
        </summary>
        <div className="p-3 pt-0">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3">
          <CardTitle className="text-base">{t("workspace.payment.title")}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={syncFromGantt}
              disabled={upsert.isPending || applyGen.isPending}
              title={t("workspace.payment.syncFromGanttHint", { defaultValue: "Pull any missing suppliers from the planning Gantt into the schedule" })}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("workspace.payment.syncFromGantt", { defaultValue: "Update from Gantt" })}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <Wand2 className="h-3.5 w-3.5" />
                  {t("workspace.payment.generators")}
                </Button>
              </PopoverTrigger>
            <PopoverContent align="end" className="w-[640px] p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {quoteQ.data?.quote_category !== "retainer" && (
                  <>
                    <Button size="sm" variant="outline" disabled={applyGen.isPending} onClick={() => runGenerator("milestones")}>
                      {t("workspace.payment.genMilestones")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={applyGen.isPending} onClick={() => runGenerator("thirds")}>
                      {t("workspace.payment.genThirds")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={applyGen.isPending} onClick={() => runGenerator("monthly")}>
                      {t("workspace.payment.genMonthly")}
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={applyGen.isPending}
                  onClick={() => runGenerator("by_stage_billing")}
                  title={t("workspace.payment.genByStageBillingHint", { defaultValue: "Use each stage's billing model (stage / monthly / retainer)" })}
                >
                  {t("workspace.payment.genByStageBilling", { defaultValue: "Per stage model" })}
                </Button>
                <Button
                  size="sm"
                  disabled={applyGen.isPending}
                  onClick={() => runGenerator("architecture_with_consultants")}
                  title={t("workspace.payment.genArchConsultantsHint", { defaultValue: "Architecture invoices + per-supplier payouts (pay when paid)" })}
                >
                  {t("workspace.payment.genArchConsultants", { defaultValue: "Architecture + Consultants" })}
                </Button>
              </div>
              {quoteQ.data?.quote_category !== "retainer" && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {t("workspace.payment.milestoneOptionsTitle")}
                  </div>
                  <div className="grid gap-2 grid-cols-2 md:grid-cols-4 items-end">
                    <div>
                      <Label className="text-xs">{t("workspace.payment.downPaymentPercent")}</Label>
                      <Input
                        type="number" step="0.01" min="0"
                        disabled={!milestoneOpts.downPaymentEnabled}
                        value={milestoneOpts.downPaymentPercent}
                        onChange={(e) => setMilestoneOpts((p) => ({ ...p, downPaymentPercent: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("workspace.payment.stageStartPercent")}</Label>
                      <Input
                        type="number" step="0.01" min="0"
                        value={milestoneOpts.stageStartPercent}
                        onChange={(e) => setMilestoneOpts((p) => ({ ...p, stageStartPercent: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("workspace.payment.stageEndPercent")}</Label>
                      <Input
                        type="number" step="0.01" min="0"
                        value={milestoneOpts.stageEndPercent}
                        onChange={(e) => setMilestoneOpts((p) => ({ ...p, stageEndPercent: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("workspace.payment.paymentTermsDays")}</Label>
                      <Input
                        type="number" step="1" min="0" placeholder="0"
                        value={milestoneOpts.paymentTermsDays}
                        onChange={(e) => setMilestoneOpts((p) => ({ ...p, paymentTermsDays: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    <div className="flex items-center gap-2 col-span-2 md:col-span-4">
                      <Checkbox
                        id="dp-enabled"
                        checked={milestoneOpts.downPaymentEnabled}
                        onCheckedChange={(v) => setMilestoneOpts((p) => ({ ...p, downPaymentEnabled: Boolean(v) }))}
                      />
                      <Label htmlFor="dp-enabled" className="text-xs cursor-pointer">
                        {t("workspace.payment.downPaymentEnabled")}
                      </Label>
                      <Checkbox
                        id="dp-deduct"
                        checked={milestoneOpts.deductDownPaymentFromStages}
                        disabled={!milestoneOpts.downPaymentEnabled}
                        onCheckedChange={(v) => setMilestoneOpts((p) => ({ ...p, deductDownPaymentFromStages: Boolean(v) }))}
                        className="ml-4"
                      />
                      <Label htmlFor="dp-deduct" className="text-xs cursor-pointer">
                        {t("workspace.payment.deductDownPayment")}
                      </Label>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      disabled={applyGen.isPending}
                      onClick={() => runGenerator("by_stage_billing", { replaceAll: true })}
                    >
                      {t("workspace.payment.saveAndApply", { defaultValue: "Save & apply" })}
                    </Button>
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead className="min-w-[240px]">{t("workspace.payment.label")}</TableHead>
                <TableHead>{t("workspace.payment.trigger")}</TableHead>
                <TableHead>{t("common.stage")}</TableHead>
                <TableHead className="text-right">{t("workspace.payment.amount")}</TableHead>
                <TableHead className="text-right w-20">IVA %</TableHead>
                <TableHead className="text-right">Valor c/ IVA</TableHead>
                <TableHead>{t("workspace.payment.invoiceDate")}</TableHead>
                <TableHead className="min-w-[160px]">Condições</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.filter((it) => ((it as unknown as { direction?: string }).direction ?? "inflow") === "inflow").map((it) => {
                const i = items.indexOf(it);
                const itAny = it as unknown as { vat_rate?: number | null; payment_terms?: string | null };
                const net = resolveScheduleItemAmount(
                  { amount_type: it.amount_type, amount_value: Number(it.amount_value ?? 0), trigger_type: it.trigger_type, stage_id: it.stage_id },
                  contractTotal,
                  stageFees,
                );
                const vat = Number(itAny.vat_rate ?? defaultVatRate);
                const gross = net + (net * vat) / 100;
                return (
                <TableRow key={it.id} className="align-top">
                  <TableCell>
                    <div className="flex flex-col">
                      <Button variant="ghost" size="sm" className="h-5 p-0" onClick={() => move(i, -1)}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-5 p-0" onClick={() => move(i, 1)}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      <InlineLabelEditor
                        value={it.label}
                        onSave={(next) => upsert.mutate({ id: it.id, label: next })}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        {it.manual_override ? (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {t("workspace.payment.manualBadge")}
                          </Badge>
                        ) : it.generator_source ? (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {it.generator_source}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {QUOTE_PAYMENT_TRIGGERS.find((x) => x.value === it.trigger_type)?.label}
                  </TableCell>
                  <TableCell>
                    {it.stage_id ? stages.find((s) => s.id === it.stage_id)?.name ?? "—" : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {it.amount_type === "percent"
                      ? `${Number(it.amount_value)}%`
                      : formatEUR(Number(it.amount_value))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="h-7 w-16 text-right text-xs"
                      defaultValue={vat}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v) || v < 0 || v > 100) return;
                        if (v === vat) return;
                        upsert.mutate({ id: it.id, vat_rate: v, vat_rate_override: true });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatEUR(gross)}
                  </TableCell>
                  <TableCell>{it.expected_invoice_date ?? "—"}</TableCell>
                  <TableCell>
                    <Input
                      className="h-7 text-xs"
                      defaultValue={itAny.payment_terms ?? ""}
                      placeholder={paymentDefaults.defaultTerms}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v === (itAny.payment_terms ?? "")) return;
                        upsert.mutate({ id: it.id, payment_terms: v || null });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!it.manual_override && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title={t("workspace.payment.lockTooltip")}
                          onClick={() => upsert.mutate({ id: it.id, manual_override: true })}
                        >
                          🔒
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(it.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
              {items.filter((it) => ((it as unknown as { direction?: string }).direction ?? "inflow") === "inflow").length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-6">
                    {t("workspace.payment.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </div>
      </details>

      {/* Suppliers — outflows grouped by supplier (broken-down payouts) */}
      {(() => {
        const outflows = items.filter((it) => (it as unknown as { direction?: string }).direction === "outflow");
        if (outflows.length === 0) return null;
        const buckets = new Map<string, typeof outflows>();
        const labelMap = new Map<string, string>();
        for (const o of outflows) {
          const oa = o as unknown as { supplier_company_id?: string | null; supplier_id?: string | null; supplier_label?: string | null };
          let key: string;
          let label = "";
          if (oa.supplier_company_id) {
            key = `c:${oa.supplier_company_id}`;
          } else if (oa.supplier_id) {
            key = `s:${oa.supplier_id}`;
          } else if (oa.supplier_label && oa.supplier_label.trim()) {
            key = `p:${oa.supplier_label.trim().toLowerCase()}`;
            label = oa.supplier_label.trim();
          } else {
            key = "__unassigned__";
          }
          if (!labelMap.has(key)) labelMap.set(key, label);

          const arr = buckets.get(key) ?? [];
          arr.push(o);
          buckets.set(key, arr);
        }
        const supplierNameMap = new Map<string, string>();
        for (const s of suppliers) if (s.id) supplierNameMap.set(s.id, s.name);
        return (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">
                {t("workspace.payment.suppliersTitle", { defaultValue: "Suppliers — outflows" })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from(buckets.entries()).map(([key, rows]) => {
                const id = key.slice(2);
                const name = key === "__unassigned__"
                  ? t("workspace.payment.unassignedSupplier", { defaultValue: "Unassigned" })
                  : key.startsWith("p:")
                    ? `${labelMap.get(key) || "Supplier"} · ${t("workspace.payment.placeholderTag", { defaultValue: "to be defined" })}`
                    : supplierNameMap.get(id) ?? "—";

                const groupTotal = rows.reduce((s, r) => s + resolveScheduleItemAmount(
                  { amount_type: r.amount_type, amount_value: Number(r.amount_value ?? 0), trigger_type: r.trigger_type, stage_id: r.stage_id },
                  contractTotal, stageFees,
                ), 0);
                return (
                  <div key={key} className="rounded-md border">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
                      <div className="text-sm font-semibold uppercase tracking-wide">{name}</div>
                      <div className="text-sm font-semibold tabular-nums">{formatEUR(groupTotal)}</div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[240px]">{t("workspace.payment.label")}</TableHead>
                          <TableHead>{t("workspace.payment.trigger")}</TableHead>
                          <TableHead>{t("common.stage")}</TableHead>
                          <TableHead className="text-right">{t("workspace.payment.amount")}</TableHead>
                          <TableHead className="text-right w-20">IVA %</TableHead>
                          <TableHead className="text-right">Valor c/ IVA</TableHead>
                          <TableHead>{t("workspace.payment.paymentDate")}</TableHead>
                          <TableHead className="min-w-[160px]">Condições</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((it) => {
                          const itAny = it as unknown as { vat_rate?: number | null; payment_terms?: string | null };
                          const net = resolveScheduleItemAmount(
                            { amount_type: it.amount_type, amount_value: Number(it.amount_value ?? 0), trigger_type: it.trigger_type, stage_id: it.stage_id },
                            contractTotal, stageFees,
                          );
                          const vat = Number(itAny.vat_rate ?? defaultVatRate);
                          const gross = net + (net * vat) / 100;
                          return (
                            <TableRow key={it.id} className="align-top">
                              <TableCell className="font-medium">{it.label}</TableCell>
                              <TableCell className="text-xs">
                                {QUOTE_PAYMENT_TRIGGERS.find((x) => x.value === it.trigger_type)?.label}
                              </TableCell>
                              <TableCell className="text-xs">
                                {it.stage_id ? stages.find((s) => s.id === it.stage_id)?.name ?? "—" : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatEUR(net)}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number" step="0.1" min="0" max="100"
                                  className="h-7 w-16 text-right text-xs"
                                  defaultValue={vat}
                                  onBlur={(e) => {
                                    const v = Number(e.target.value);
                                    if (!Number.isFinite(v) || v < 0 || v > 100 || v === vat) return;
                                    upsert.mutate({ id: it.id, vat_rate: v, vat_rate_override: true });
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">{formatEUR(gross)}</TableCell>
                              <TableCell className="text-xs">{it.expected_payment_date ?? it.expected_invoice_date ?? "—"}</TableCell>
                              <TableCell>
                                <Input
                                  className="h-7 text-xs"
                                  defaultValue={itAny.payment_terms ?? ""}
                                  placeholder={paymentDefaults.defaultTerms}
                                  onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    if (v === (itAny.payment_terms ?? "")) return;
                                    upsert.mutate({ id: it.id, payment_terms: v || null });
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" onClick={() => remove.mutate(it.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}

    </div>
  );
}
