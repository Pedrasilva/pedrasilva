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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, ArrowUp, ArrowDown, Wand2, Pencil } from "lucide-react";
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

export function QuotePaymentScheduleTab({ quoteId }: { quoteId: string }) {
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
  const stageFees = { ...leafStageFees, ...rolledUpBillableFees(stages, leafStageFees) };

  // Supplier names for grouped outflow rows in the proposal view.
  const supplierIds = Array.from(
    new Set(
      items
        .map((it) => (it as unknown as { supplier_company_id?: string | null }).supplier_company_id)
        .filter((x): x is string => !!x),
    ),
  );
  const suppliersQ = useQuery({
    queryKey: ["payment-schedule-suppliers", quoteId, supplierIds.sort().join(",")],
    enabled: supplierIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { in: (c: string, v: string[]) => Promise<{ data: { id: string; name: string }[] | null; error: { message: string } | null }> } } })
        .from("companies")
        .select("id,name")
        .in("id", supplierIds);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const suppliers = (suppliersQ.data ?? []).map((c) => ({ id: c.id, name: c.name }));

  const scheduleTotal = items.reduce(
    (sum, it) =>
      sum +
      resolveScheduleItemAmount(
        {
          amount_type: it.amount_type,
          amount_value: Number(it.amount_value ?? 0),
          trigger_type: it.trigger_type,
          stage_id: it.stage_id,
        },
        totalFee,
        stageFees,
      ),
    0,
  );
  const totalMismatch =
    totalFee > 0 && Math.abs(scheduleTotal - totalFee) > 0.5;

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
    if (itemsQ.isLoading || stagesQ.isLoading) return;
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
        externalServices: externals,
        paymentOffsetDays: Number(milestoneOpts.paymentTermsDays) || 30,
      }),
      paymentDefaults,
    );
    if (generated.length === 0) return;
    applyGen.mutate({ generator: "by_stage_billing", items: generated });
  }, [itemsQ.isLoading, stagesQ.isLoading, items.length, stages, stageFees, applyGen]);

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

  const runGenerator = async (kind: GeneratorKind) => {
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
        totalFee,
      });
    } else if (kind === "thirds") {
      generated = generateThirds(stages);
    } else if (kind === "monthly") {
      generated = generateMonthly(stages);
    } else if (kind === "by_stage_billing") {
      generated = generateByStageBilling(stages, stageFees);
    } else if (kind === "architecture_with_consultants") {
      generated = generateArchitectureWithConsultants(stages, externals, stageFees, {
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
      await applyGen.mutateAsync({ generator: kind, items: generated });
      toast.success(
        protectedCount > 0
          ? t("workspace.payment.generatorAppliedKeep", { count: protectedCount })
          : t("workspace.payment.generatorApplied"),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="text-sm">
          <div className="font-medium">
            {t("workspace.payment.applyCalculator", { defaultValue: "Aplicar valores da calculadora" })}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("workspace.payment.applyCalculatorHint", { defaultValue: "Empurra os honorários e datas actuais das fases para o plano de pagamentos (linhas manuais são preservadas)." })}
          </div>
        </div>
        <Button
          size="sm"
          disabled={applyGen.isPending || stages.length === 0}
          onClick={() => runGenerator("by_stage_billing")}
        >
          <Wand2 className="h-3.5 w-3.5 mr-1.5" />
          {t("workspace.payment.applyCalculatorBtn", { defaultValue: "Aplicar" })}
        </Button>
      </div>
      {totalFee > 0 && (
        <div
          className={`rounded-md border p-3 text-sm flex items-center justify-between gap-3 ${
            totalMismatch
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-border bg-muted/30 text-muted-foreground"
          }`}
        >
          <div>
            <span className="font-medium">{formatEUR(scheduleTotal)}</span>
            <span className="opacity-70"> / {formatEUR(totalFee)} </span>
            <span className="opacity-70">
              ({t("workspace.payment.scheduleTotalLabel", { defaultValue: "Schedule total vs proposal fee (excl. VAT)" })})
            </span>
          </div>
          {totalMismatch && (
            <span className="text-xs font-medium">
              {t("workspace.payment.totalMismatchWarning", {
                defaultValue: "Schedule total does not match the proposal fee.",
              })}
            </span>
          )}
        </div>
      )}

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

      {/* Proposal-style read-only layout (mirrors printed proposal) */}
      <PaymentScheduleProposalView
        items={items}
        stages={stages}
        totalFee={totalFee}
        stageFees={stageFees}
        suppliers={suppliers}
        defaultVatRate={defaultVatRate}
      />


      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{t("workspace.payment.title")}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden md:inline">
              <Wand2 className="h-3 w-3 inline mr-1" />
              {t("workspace.payment.generators")}
            </span>
            {quoteQ.data?.quote_category !== "retainer" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={applyGen.isPending}
                  onClick={() => runGenerator("milestones")}
                >
                  {t("workspace.payment.genMilestones")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={applyGen.isPending}
                  onClick={() => runGenerator("thirds")}
                >
                  {t("workspace.payment.genThirds")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={applyGen.isPending}
                  onClick={() => runGenerator("monthly")}
                >
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
        </CardHeader>
        <CardContent className="space-y-4">
          {quoteQ.data?.quote_category !== "retainer" && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {t("workspace.payment.milestoneOptionsTitle")}
            </div>
            <div className="grid gap-3 md:grid-cols-5 items-end">
              <div className="flex items-center gap-2 md:col-span-1">
                <Checkbox
                  id="dp-enabled"
                  checked={milestoneOpts.downPaymentEnabled}
                  onCheckedChange={(v) =>
                    setMilestoneOpts((p) => ({ ...p, downPaymentEnabled: Boolean(v) }))
                  }
                />
                <Label htmlFor="dp-enabled" className="text-xs cursor-pointer">
                  {t("workspace.payment.downPaymentEnabled")}
                </Label>
              </div>
              <div>
                <Label className="text-xs">{t("workspace.payment.downPaymentPercent")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={!milestoneOpts.downPaymentEnabled}
                  value={milestoneOpts.downPaymentPercent}
                  onChange={(e) =>
                    setMilestoneOpts((p) => ({ ...p, downPaymentPercent: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">{t("workspace.payment.stageStartPercent")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={milestoneOpts.stageStartPercent}
                  onChange={(e) =>
                    setMilestoneOpts((p) => ({ ...p, stageStartPercent: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">{t("workspace.payment.stageEndPercent")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={milestoneOpts.stageEndPercent}
                  onChange={(e) =>
                    setMilestoneOpts((p) => ({ ...p, stageEndPercent: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">{t("workspace.payment.paymentTermsDays")}</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="0"
                  value={milestoneOpts.paymentTermsDays}
                  onChange={(e) =>
                    setMilestoneOpts((p) => ({ ...p, paymentTermsDays: e.target.value }))
                  }
                />
              </div>
              <div className="flex items-center gap-2 md:col-span-5">
                <Checkbox
                  id="dp-deduct"
                  checked={milestoneOpts.deductDownPaymentFromStages}
                  disabled={!milestoneOpts.downPaymentEnabled}
                  onCheckedChange={(v) =>
                    setMilestoneOpts((p) => ({ ...p, deductDownPaymentFromStages: Boolean(v) }))
                  }
                />
                <Label htmlFor="dp-deduct" className="text-xs cursor-pointer">
                  {t("workspace.payment.deductDownPayment")}
                </Label>
              </div>
            </div>
          </div>
          )}
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
              {items.map((it, i) => {
                const itAny = it as unknown as { vat_rate?: number | null; payment_terms?: string | null };
                const net = resolveScheduleItemAmount(
                  { amount_type: it.amount_type, amount_value: Number(it.amount_value ?? 0), trigger_type: it.trigger_type, stage_id: it.stage_id },
                  totalFee,
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
                        {((it as unknown as { direction?: string }).direction === "outflow") ? (
                          <Badge className="text-[10px] px-1 py-0 bg-rose-100 text-rose-800 hover:bg-rose-100">
                            {t("workspace.payment.outflowBadge", { defaultValue: "Outflow" })}
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] px-1 py-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            {t("workspace.payment.inflowBadge", { defaultValue: "Inflow" })}
                          </Badge>
                        )}
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
              {items.length === 0 && (
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.payment.addTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-3">
            <Label>{t("workspace.payment.label")}</Label>
            <AutoTextarea
              value={draft.label}
              onChange={(v) => setDraft((p) => ({ ...p, label: v }))}
              placeholder={t("workspace.payment.labelPlaceholder")}
              minHeight={80}
            />
          </div>
          <div>
            <Label>{t("workspace.payment.trigger")}</Label>
            <Select
              value={draft.trigger_type}
              onValueChange={(v) => setDraft((p) => ({ ...p, trigger_type: v as QuotePaymentTrigger }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUOTE_PAYMENT_TRIGGERS.map((x) => (
                  <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {stageRequired && (
            <div>
              <Label>{t("common.stage")} *</Label>
              <Select
                value={draft.stage_id}
                onValueChange={(v) => setDraft((p) => ({ ...p, stage_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>{t("workspace.payment.amountType")}</Label>
            <Select
              value={draft.amount_type}
              onValueChange={(v) => setDraft((p) => ({ ...p, amount_type: v as QuotePaymentAmountType }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUOTE_PAYMENT_AMOUNT_TYPES.map((x) => (
                  <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("workspace.payment.amount")}</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.amount_value}
              onChange={(e) => setDraft((p) => ({ ...p, amount_value: e.target.value }))}
            />
          </div>
          <div>
            <Label>
              {t("workspace.payment.invoiceDate")}{dateRequired && " *"}
            </Label>
            <Input
              type="date"
              value={draft.expected_invoice_date}
              onChange={(e) => setDraft((p) => ({ ...p, expected_invoice_date: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("workspace.payment.paymentDate")}</Label>
            <Input
              type="date"
              value={draft.expected_payment_date}
              onChange={(e) => setDraft((p) => ({ ...p, expected_payment_date: e.target.value }))}
            />
          </div>
          <div className="md:col-span-3 flex justify-end border-t pt-4">
            <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> {t("common.create")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
