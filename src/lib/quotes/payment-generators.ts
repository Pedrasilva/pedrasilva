/**
 * Payment schedule generators for quotes.
 *
 * Each generator produces a list of payment items for a given quote planning
 * context (stages + total fee). Generators NEVER overwrite items flagged
 * `manual_override = true`. Existing generator-created items are replaced
 * when their generator_source matches.
 */
import type { QuoteStage } from "./types";
import type { QuoteAllocationWithResource } from "./use-quote-allocations";
import type { QuoteExternalServiceWithSupplier } from "./use-quote-external-services";
import { quoteAllocationLine } from "./financial-rollups";
import { topLevelBillableStages, getStageBillingTiming } from "./stage-billing";

export type GeneratorKind =
  | "milestones"
  | "thirds"
  | "monthly"
  | "by_stage_billing"
  | "architecture_with_consultants";

export interface GeneratorItem {
  label: string;
  trigger_type: "project_start" | "stage_start" | "stage_end" | "manual_date" | "monthly";
  amount_type: "percent" | "fixed";
  amount_value: number;
  stage_id: string | null;
  expected_invoice_date: string | null;
  expected_payment_date: string | null;
  sort_order: number;
  generator_source: GeneratorKind;
  /** inflow = client → us (architecture); outflow = us → supplier (consultants). */
  direction?: "inflow" | "outflow";
  /** Set on outflow rows so cashflow can attribute payouts to a supplier. */
  supplier_company_id?: string | null;
  /** Master directory (pm_suppliers) FK for outflows. */
  supplier_id?: string | null;
  /** Free-text supplier label when supplier isn't yet known (Gantt placeholder). */
  supplier_label?: string | null;
  /** VAT % applied to amount (default 23). */
  vat_rate?: number;
  /** Free-text payment condition (e.g. "Pronto pagamento", "30 dias"). */
  payment_terms?: string | null;

}

/** Quote-level billing defaults (VAT %, payment-term strings). */
export interface PaymentDefaults {
  vatRate: number;
  defaultTerms: string;
  firstPaymentTerms: string;
}

export const DEFAULT_PAYMENT_DEFAULTS: PaymentDefaults = {
  vatRate: 23,
  defaultTerms: "30 (trinta) dias de calendário",
  firstPaymentTerms: "Pronto pagamento",
};

/** Build a descriptive label from trigger + stage name (PT-style). */
function describeLabel(
  trigger: GeneratorItem["trigger_type"],
  stageName: string | null,
  variant?: "split-start" | "split-end",
): string {
  if (trigger === "project_start") return "Adjudicação";
  if (trigger === "monthly" && stageName) return stageName;
  if (trigger === "manual_date") return stageName ?? "Pagamento intermédio";
  if (!stageName) return "Pagamento";
  if (trigger === "stage_start") {
    return variant === "split-start"
      ? `50% — Início da fase de ${stageName}`
      : `Início da fase de ${stageName}`;
  }
  // stage_end
  return variant === "split-end"
    ? `50% — Conclusão da fase de ${stageName}`
    : `Conclusão da fase de ${stageName}`;
}

/** Stamp a row with VAT + payment-terms defaults. The first emitted row uses
 *  firstPaymentTerms (e.g. "Pronto pagamento"), subsequent rows use defaultTerms.  */
function stampDefaults<T extends GeneratorItem>(
  row: T,
  defaults: PaymentDefaults | undefined,
  index: number,
): T {
  if (!defaults) return row;
  return {
    ...row,
    vat_rate: row.vat_rate ?? defaults.vatRate,
    payment_terms:
      row.payment_terms ??
      (index === 0 ? defaults.firstPaymentTerms : defaults.defaultTerms),
  } as T;
}

/** Apply quote-level defaults (VAT %, payment terms) onto a generated list,
 *  in place-style (returns a new array). First row uses firstPaymentTerms
 *  (e.g. "Pronto pagamento"); the rest use defaultTerms. */
export function applyPaymentDefaults(
  items: GeneratorItem[],
  defaults: PaymentDefaults = DEFAULT_PAYMENT_DEFAULTS,
): GeneratorItem[] {
  return items.map((row, i) => stampDefaults(row, defaults, i));
}

export interface StageMilestonesOptions {
  /** Whether to include an upfront down payment item triggered at project_start. */
  downPaymentEnabled: boolean;
  /** Down payment percentage of total proposal fee (>= 0). */
  downPaymentPercent: number;
  /** Percent of EACH stage's own fee invoiced at the start of that stage. */
  stageStartPercent: number;
  /** Percent of EACH stage's own fee invoiced at the end of that stage. */
  stageEndPercent: number;
  /**
   * When true, the down-payment amount is deducted proportionally from each
   * stage's start+end pair so the schedule total still equals the proposal
   * total fee (excl. VAT).
   */
  deductDownPaymentFromStages?: boolean;
  /** Optional payment terms in days, used to derive expected_payment_date. */
  paymentTermsDays?: number | null;
  /**
   * Per-stage fee map keyed by stage_id (in proposal currency, excl. VAT).
   * When provided, the generator emits fixed-amount rows so percentages are
   * applied to each stage's OWN fee rather than the project total.
   */
  stageFees?: Record<string, number>;
  /** Total proposal fee — used for the down-payment amount and validation. */
  totalFee?: number;
}

export const DEFAULT_STAGE_MILESTONE_OPTIONS: StageMilestonesOptions = {
  downPaymentEnabled: true,
  downPaymentPercent: 10,
  stageStartPercent: 50,
  stageEndPercent: 50,
  deductDownPaymentFromStages: false,
  paymentTermsDays: null,
};

/**
 * Compute the fee per stage from quote allocations + external services.
 * Multiplier is applied to the sale side, matching `rollupQuote`.
 * Stages with no rows return 0.
 */
export function computeStageFees(
  stages: QuoteStage[],
  allocations: QuoteAllocationWithResource[],
  externalServices: QuoteExternalServiceWithSupplier[],
  pricingMultiplier = 1,
): Record<string, number> {
  const m = pricingMultiplier > 0 ? pricingMultiplier : 1;
  const map: Record<string, number> = {};
  for (const s of stages) map[s.id] = 0;
  for (const a of allocations) {
    if (!a.stage_id || !(a.stage_id in map)) continue;
    map[a.stage_id] += quoteAllocationLine(a).revenue * m;
  }
  for (const es of externalServices) {
    if (!es.stage_id || !(es.stage_id in map)) continue;
    const value = Number(es.sale_price ?? 0) * Number(es.quantity ?? 1);
    map[es.stage_id] += value * m;
  }
  // Round to cents.
  for (const k of Object.keys(map)) map[k] = Math.round(map[k] * 100) / 100;
  return map;
}

/**
 * Resolve a schedule item to its concrete € amount, given the totalFee and
 * per-stage fees. Stage-anchored percent items use the stage's OWN fee.
 */
export function resolveScheduleItemAmount(
  item: {
    amount_type: "percent" | "fixed" | string;
    amount_value: number | string | null;
    trigger_type: string;
    stage_id: string | null;
  },
  totalFee: number,
  stageFees: Record<string, number>,
): number {
  const value = Number(item.amount_value ?? 0);
  if (item.amount_type === "fixed") return value;
  // percent
  if (
    (item.trigger_type === "stage_start" || item.trigger_type === "stage_end") &&
    item.stage_id &&
    stageFees[item.stage_id] !== undefined
  ) {
    return (stageFees[item.stage_id] * value) / 100;
  }
  return (totalFee * value) / 100;
}

/**
 * Stage-based milestones tailored for architecture fee proposals:
 *   - optional down payment at project_start
 *   - "Start of <stage>" at stage_start (default 50%)
 *   - "End of <stage>" at stage_end   (default 50%)
 *
 * Validation rules (caller is responsible for surfacing errors):
 *   - downPaymentPercent >= 0
 *   - stageStartPercent + stageEndPercent === 100
 */
export function generateStageMilestones(
  stages: QuoteStage[],
  options: StageMilestonesOptions = DEFAULT_STAGE_MILESTONE_OPTIONS,
): GeneratorItem[] {
  if (stages.length === 0) return [];
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);

  const items: GeneratorItem[] = [];
  let order = 0;

  const useFixed = !!options.stageFees;
  const totalFee = options.totalFee ?? 0;

  // ── Down payment ────────────────────────────────────────────────
  let downPaymentAmount = 0;
  if (options.downPaymentEnabled && options.downPaymentPercent > 0) {
    const earliestStart = sorted.reduce(
      (m, s) => (s.start_date < m ? s.start_date : m),
      sorted[0].start_date,
    );
    downPaymentAmount = round2((totalFee * options.downPaymentPercent) / 100);
    items.push({
      label: "Down payment",
      trigger_type: "project_start",
      amount_type: useFixed ? "fixed" : "percent",
      amount_value: useFixed ? downPaymentAmount : round2(options.downPaymentPercent),
      stage_id: null,
      expected_invoice_date: earliestStart,
      expected_payment_date: addDaysISO(earliestStart, options.paymentTermsDays),
      sort_order: order++,
      generator_source: "milestones",
    });
  }

  // ── Stage rows ──────────────────────────────────────────────────
  const totalStageRows = sorted.length * 2;
  const perRowDeduction =
    options.deductDownPaymentFromStages && downPaymentAmount > 0 && totalStageRows > 0
      ? downPaymentAmount / totalStageRows
      : 0;

  for (const s of sorted) {
    const stageFee = useFixed ? options.stageFees?.[s.id] ?? 0 : 0;
    const startAmount = useFixed
      ? round2((stageFee * options.stageStartPercent) / 100 - perRowDeduction)
      : round2(options.stageStartPercent);
    const endAmount = useFixed
      ? round2((stageFee * options.stageEndPercent) / 100 - perRowDeduction)
      : round2(options.stageEndPercent);

    items.push({
      label: `Start of ${s.name}`,
      trigger_type: "stage_start",
      amount_type: useFixed ? "fixed" : "percent",
      amount_value: startAmount,
      stage_id: s.id,
      expected_invoice_date: s.start_date,
      expected_payment_date: addDaysISO(s.start_date, options.paymentTermsDays),
      sort_order: order++,
      generator_source: "milestones",
    });
    items.push({
      label: `End of ${s.name}`,
      trigger_type: "stage_end",
      amount_type: useFixed ? "fixed" : "percent",
      amount_value: endAmount,
      stage_id: s.id,
      expected_invoice_date: s.end_date,
      expected_payment_date: addDaysISO(s.end_date, options.paymentTermsDays),
      sort_order: order++,
      generator_source: "milestones",
    });
  }

  return items;
}


function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addDaysISO(iso: string | null, days: number | null | undefined): string | null {
  if (!iso || !days || days <= 0) return iso ?? null;
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 30% project_start, 40% mid (manual_date midpoint), 30% project_end (last stage_end). */
export function generateThirds(stages: QuoteStage[]): GeneratorItem[] {
  if (stages.length === 0) {
    return [
      {
        label: "Adiantamento (30%)",
        trigger_type: "project_start",
        amount_type: "percent",
        amount_value: 30,
        stage_id: null,
        expected_invoice_date: null,
        expected_payment_date: null,
        sort_order: 0,
        generator_source: "thirds",
      },
      {
        label: "Intermédio (40%)",
        trigger_type: "manual_date",
        amount_type: "percent",
        amount_value: 40,
        stage_id: null,
        expected_invoice_date: null,
        expected_payment_date: null,
        sort_order: 1,
        generator_source: "thirds",
      },
      {
        label: "Final (30%)",
        trigger_type: "manual_date",
        amount_type: "percent",
        amount_value: 30,
        stage_id: null,
        expected_invoice_date: null,
        expected_payment_date: null,
        sort_order: 2,
        generator_source: "thirds",
      },
    ];
  }

  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const lastStage = sorted[sorted.length - 1];
  const minStart = sorted.reduce((m, s) => (s.start_date < m ? s.start_date : m), sorted[0].start_date);
  const maxEnd = sorted.reduce((m, s) => (s.end_date > m ? s.end_date : m), sorted[0].end_date);
  const midDate = midpointISO(minStart, maxEnd);

  return [
    {
      label: "Adiantamento (30%)",
      trigger_type: "project_start",
      amount_type: "percent",
      amount_value: 30,
      stage_id: null,
      expected_invoice_date: minStart,
      expected_payment_date: null,
      sort_order: 0,
      generator_source: "thirds",
    },
    {
      label: "Intermédio (40%)",
      trigger_type: "manual_date",
      amount_type: "percent",
      amount_value: 40,
      stage_id: null,
      expected_invoice_date: midDate,
      expected_payment_date: null,
      sort_order: 1,
      generator_source: "thirds",
    },
    {
      label: "Final (30%)",
      trigger_type: "stage_end",
      amount_type: "percent",
      amount_value: 30,
      stage_id: lastStage.id,
      expected_invoice_date: lastStage.end_date,
      expected_payment_date: null,
      sort_order: 2,
      generator_source: "thirds",
    },
  ];
}

/** N monthly invoices spread across the project span. Equal % split. */
export function generateMonthly(stages: QuoteStage[]): GeneratorItem[] {
  if (stages.length === 0) return [];
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const minStart = sorted.reduce((m, s) => (s.start_date < m ? s.start_date : m), sorted[0].start_date);
  const maxEnd = sorted.reduce((m, s) => (s.end_date > m ? s.end_date : m), sorted[0].end_date);

  const months = monthsBetween(minStart, maxEnd);
  if (months.length === 0) return [];

  const pct = Math.floor((100 / months.length) * 100) / 100;
  const items: GeneratorItem[] = months.map((d, i) => ({
    label: `${formatYearMonth(d)}`,
    trigger_type: "monthly",
    amount_type: "percent",
    amount_value: pct,
    stage_id: null,
    expected_invoice_date: d,
    expected_payment_date: null,
    sort_order: i,
    generator_source: "monthly",
  }));
  const sum = items.reduce((a, x) => a + x.amount_value, 0);
  const residual = Math.round((100 - sum) * 100) / 100;
  if (residual !== 0 && items.length > 0) {
    items[items.length - 1].amount_value =
      Math.round((items[items.length - 1].amount_value + residual) * 100) / 100;
  }
  return items;
}

/**
 * Per-stage billing generator. Walks each stage and emits items based on
 * the stage's billing_model:
 *   - 'stage'    → one fixed payment at stage_end equal to the stage fee
 *   - 'monthly'  → stage fee split evenly across its calendar months
 *   - 'retainer' → retainer_monthly_amount × each month of the stage span
 */
export interface ByStageBillingOptions {
  /** When > 0, prepend an "Adjudicação" inflow row at project_start. */
  downPaymentPercent?: number;
  /** Deduct the down payment proportionally from subsequent stage rows. */
  deductDownPaymentFromStages?: boolean;
  /** When provided, also emit supplier outflow rows per stage. */
  externalServices?: QuoteExternalServiceWithSupplier[];
  /** Days after each stage_end to date the supplier outflow ("pay when paid"). */
  paymentOffsetDays?: number;
}

export function generateByStageBilling(
  stages: QuoteStage[],
  stageFees: Record<string, number>,
  options: ByStageBillingOptions = {},
): GeneratorItem[] {
  if (stages.length === 0) return [];
  type StageNode = QuoteStage & {
    parent_stage_id?: string | null;
    billing_model?: string | null;
    stage_kind?: string | null;
  };
  const allStages = stages as StageNode[];
  const stageById = new Map(allStages.map((s) => [s.id, s]));
  const childrenByParent = new Map<string, StageNode[]>();
  for (const s of allStages) {
    const parentId = s.parent_stage_id ?? null;
    if (!parentId) continue;
    const arr = childrenByParent.get(parentId) ?? [];
    arr.push(s);
    childrenByParent.set(parentId, arr);
  }
  const hasDescendant = (ancestorId: string, maybeChildId: string): boolean => {
    const children = childrenByParent.get(ancestorId) ?? [];
    return children.some((child) => child.id === maybeChildId || hasDescendant(child.id, maybeChildId));
  };
  const effectiveSpan = (stage: StageNode): { start: string; end: string } => {
    const children = childrenByParent.get(stage.id) ?? [];
    if (children.length === 0) return { start: stage.start_date, end: stage.end_date };
    return children.reduce(
      (span, child) => {
        const childSpan = effectiveSpan(child);
        return {
          start: childSpan.start < span.start ? childSpan.start : span.start,
          end: childSpan.end > span.end ? childSpan.end : span.end,
        };
      },
      { start: stage.start_date, end: stage.end_date },
    );
  };
  // Exclude children of parent bars — only top-level stages bill the client.
  const billable = topLevelBillableStages(stages);
  const sorted = [...billable].sort((a, b) => a.sort_order - b.sort_order);
  const totalContract = sorted.reduce((acc, s) => acc + (stageFees[s.id] ?? 0), 0);
  const dpPct = Math.max(0, Number(options.downPaymentPercent ?? 0));
  const dpAmount = dpPct > 0 ? round2((totalContract * dpPct) / 100) : 0;
  const deduct = options.deductDownPaymentFromStages && dpAmount > 0;
  const remainingFactor = deduct && totalContract > 0 ? 1 - dpAmount / totalContract : 1;
  const scaleFee = (fee: number) => round2(fee * remainingFactor);
  const items: GeneratorItem[] = [];
  let order = 0;

  // ── Down payment (Adjudicação) at project_start ────────────────
  const earliestStart = sorted.length > 0
    ? sorted.reduce((m, s) => (s.start_date < m ? s.start_date : m), sorted[0].start_date)
    : null;
  if (dpAmount > 0 && earliestStart) {
    items.push({
      label: "Adjudicação",
      trigger_type: "project_start",
      amount_type: "fixed",
      amount_value: dpAmount,
      stage_id: null,
      expected_invoice_date: earliestStart,
      expected_payment_date: null,
      sort_order: order++,
      generator_source: "by_stage_billing",
      direction: "inflow",
    });
  }

  for (const s of sorted) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sa = s as any;
    const span = effectiveSpan(s as StageNode);
    const stageKind = (sa.stage_kind ?? "regular") as "regular" | "retainer_monthly";

    // New monthly-retainer model: N copies of monthly_fee starting at anchor.
    // The monthly amount is the source of truth (user-entered) — never
    // derived from allocations or stageFees, which are 0 for fee-only
    // retainers.
    if (stageKind === "retainer_monthly") {
      const months = Math.max(1, Math.min(120, Number(sa.retainer_months ?? 0) || 0));
      const anchor = (sa.retainer_anchor_month as string | null) ?? span.start;
      const monthly = round2(Number(sa.retainer_monthly_amount ?? 0));
      if (!months || !anchor || monthly <= 0) continue;
      const series = monthsFrom(anchor, months);
      series.forEach((m, i) => {
        items.push({
          label: `${s.name} — ${formatYearMonth(m)} (retainer)`,
          trigger_type: "monthly",
          amount_type: "fixed",
          amount_value: monthly,
          stage_id: s.id,
          expected_invoice_date: m,
          expected_payment_date: null,
          sort_order: order++,
          generator_source: "by_stage_billing",
        });
        void i;
      });
      continue;
    }

    const model = (sa.billing_model ?? "stage") as "stage" | "monthly" | "retainer";
    const retainer = Number(sa.retainer_monthly_amount ?? 0);
    if (model === "retainer") {
      const months = monthsBetween(span.start, span.end);
      months.forEach((m, i) => {
        items.push({
          label: `${s.name} — ${formatYearMonth(m)} (retainer)`,
          trigger_type: "monthly",
          amount_type: "fixed",
          amount_value: round2(retainer),
          stage_id: s.id,
          expected_invoice_date: m,
          expected_payment_date: null,
          sort_order: order++,
          generator_source: "by_stage_billing",
        });
        void i;
      });
    } else if (model === "monthly") {
      const months = monthsBetween(span.start, span.end);
      if (months.length === 0) continue;
      const fee = scaleFee(stageFees[s.id] ?? 0);
      const per = round2(fee / months.length);
      months.forEach((m, i) => {
        const amt = i === months.length - 1
          ? round2(fee - per * (months.length - 1))
          : per;
        items.push({
          label: `${s.name} — ${formatYearMonth(m)}`,
          trigger_type: "monthly",
          amount_type: "fixed",
          amount_value: amt,
          stage_id: s.id,
          expected_invoice_date: m,
          expected_payment_date: null,
          sort_order: order++,
          generator_source: "by_stage_billing",
        });
      });
    } else {
      // 'stage' — honor stage_billing_timing: end (default) | start | split
      const fee = scaleFee(stageFees[s.id] ?? 0);
      const timing = getStageBillingTiming(s);
      if (timing === "split") {
        const half = round2(fee / 2);
        items.push({
          label: describeLabel("stage_start", s.name, "split-start"),
          trigger_type: "stage_start",
          amount_type: "fixed",
          amount_value: half,
          stage_id: s.id,
          expected_invoice_date: span.start,
          expected_payment_date: null,
          sort_order: order++,
          generator_source: "by_stage_billing",
        });
        items.push({
          label: describeLabel("stage_end", s.name, "split-end"),
          trigger_type: "stage_end",
          amount_type: "fixed",
          amount_value: round2(fee - half),
          stage_id: s.id,
          expected_invoice_date: span.end,
          expected_payment_date: null,
          sort_order: order++,
          generator_source: "by_stage_billing",
        });
      } else if (timing === "start") {
        items.push({
          label: describeLabel("stage_start", s.name),
          trigger_type: "stage_start",
          amount_type: "fixed",
          amount_value: fee,
          stage_id: s.id,
          expected_invoice_date: span.start,
          expected_payment_date: null,
          sort_order: order++,
          generator_source: "by_stage_billing",
        });
      } else {
        items.push({
          label: describeLabel("stage_end", s.name),
          trigger_type: "stage_end",
          amount_type: "fixed",
          amount_value: fee,
          stage_id: s.id,
          expected_invoice_date: span.end,
          expected_payment_date: null,
          sort_order: order++,
          generator_source: "by_stage_billing",
        });
      }
    }
  }

  // ── Optional supplier outflows ──────────────────────────────────
  // Generate one supplier commitment from each supplier Gantt/external row.
  // Do not redistribute a supplier's total across parent bars: that was
  // causing parent+child double counting and repeated commitments.
  const externals = options.externalServices ?? [];
  const offset = Math.max(0, Number(options.paymentOffsetDays ?? 0));
  if (externals.length > 0) {
    type SupplierRow = {
      key: string;
      companyId: string | null;
      pmSupplierId: string | null;
      placeholderLabel: string | null;
      name: string;
      amount: number;
      stageId: string | null;
      description: string;
    };
    const rows: SupplierRow[] = [];
    for (const es of externals) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const esAny = es as any;
      const companyId: string | null = esAny.supplier_company_id ?? null;
      const supplierId: string | null = esAny.supplier_id ?? null;
      const placeholder: string | null = (esAny.supplier_placeholder ?? null) || null;
      if (!companyId && !supplierId && !placeholder) continue;
      const supplierKey = companyId
        ? `c:${companyId}`
        : supplierId
          ? `s:${supplierId}`
          : `p:${placeholder!.toLowerCase()}`;
      const name = es.supplier?.name ?? placeholder ?? esAny.description ?? "Supplier";
      const cost = Number(esAny.purchase_price ?? 0) * Number(esAny.quantity ?? 1);
      if (cost <= 0) continue;
      rows.push({
        key: supplierKey,
        companyId,
        pmSupplierId: supplierId,
        placeholderLabel: placeholder,
        name,
        amount: cost,
        stageId: esAny.stage_id ?? null,
        description: String(esAny.description ?? "Supplier"),
      });
    }
    const filtered = rows.filter((row) => {
      if (!row.stageId) return true;
      const stage = stageById.get(row.stageId);
      if (!stage) return true;
      const hasChildForSameSupplier = rows.some(
        (other) =>
          other !== row &&
          other.key === row.key &&
          !!other.stageId &&
          hasDescendant(stage.id, other.stageId),
      );
      return !hasChildForSameSupplier;
    });
    const merged = new Map<string, SupplierRow>();
    for (const row of filtered) {
      const mergeKey = `${row.key}|${row.stageId ?? ""}|${row.description.trim().toLowerCase()}`;
      const current = merged.get(mergeKey);
      if (current) current.amount = round2(current.amount + row.amount);
      else merged.set(mergeKey, { ...row, amount: round2(row.amount) });
    }
    for (const row of merged.values()) {
      const stage = row.stageId ? stageById.get(row.stageId) : null;
      const span = stage ? effectiveSpan(stage) : null;
      const invoiceDate = span?.end ?? null;
      items.push({
        label: `${row.name} — ${row.description}`,
        trigger_type: "stage_end",
        amount_type: "fixed",
        amount_value: round2(row.amount),
        stage_id: row.stageId,
        expected_invoice_date: invoiceDate,
        expected_payment_date: addDaysISO(invoiceDate, offset),
        sort_order: order++,
        generator_source: "by_stage_billing",
        direction: "outflow",
        supplier_company_id: row.companyId,
        supplier_id: row.pmSupplierId,
        supplier_label: row.placeholderLabel,
      });
    }
  }


  return items;
}

/**
 * Architecture + Consultants generator.
 *
 * Produces a payment schedule that mirrors the PDF layout:
 *   - One inflow row per architecture stage (stage_end), amount = stage fee.
 *   - Optional down-payment inflow at project_start.
 *   - For each supplier (grouped by supplier_company_id, falling back to
 *     supplier_id), one outflow row per architecture stage the supplier
 *     participates in. By default the supplier's total fee is split using
 *     the architecture stage % weights (inherit). Outflows are dated to the
 *     stage_end + paymentOffsetDays (pay-when-paid).
 */
export function generateArchitectureWithConsultants(
  stages: QuoteStage[],
  externalServices: QuoteExternalServiceWithSupplier[],
  stageFees: Record<string, number>,
  options: {
    downPaymentPercent?: number;
    paymentOffsetDays?: number;
    /** Per-supplier per-stage % overrides. Key: `${supplierKey}:${stageId}` → %. */
    supplierSplitOverrides?: Record<string, number>;
  } = {},
): GeneratorItem[] {
  if (stages.length === 0) return [];
  const sorted = [...stages]
    .filter((s) => (s as unknown as { stage_kind?: string }).stage_kind !== "retainer_monthly")
    .sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.length === 0) return [];

  const items: GeneratorItem[] = [];
  let order = 0;

  // Architecture inflows
  const totalArch = sorted.reduce((s, st) => s + (stageFees[st.id] ?? 0), 0);
  const earliestStart = sorted.reduce(
    (m, s) => (s.start_date < m ? s.start_date : m),
    sorted[0].start_date,
  );
  const dp = Number(options.downPaymentPercent ?? 0);
  if (dp > 0 && totalArch > 0) {
    items.push({
      label: "Adjudicação",
      trigger_type: "project_start",
      amount_type: "fixed",
      amount_value: round2((totalArch * dp) / 100),
      stage_id: null,
      expected_invoice_date: earliestStart,
      expected_payment_date: null,
      sort_order: order++,
      generator_source: "architecture_with_consultants",
      direction: "inflow",
    });
  }
  for (const s of sorted) {
    const fee = round2(stageFees[s.id] ?? 0);
    if (fee <= 0) continue;
    items.push({
      label: describeLabel("stage_end", s.name),
      trigger_type: "stage_end",
      amount_type: "fixed",
      amount_value: fee,
      stage_id: s.id,
      expected_invoice_date: s.end_date,
      expected_payment_date: null,
      sort_order: order++,
      generator_source: "architecture_with_consultants",
      direction: "inflow",
    });
  }

  // Consultant outflows — group externals by supplier company (fallback supplier_id)
  type SupplierBucket = {
    key: string;
    companyId: string | null;
    pmSupplierId: string | null;
    placeholderLabel: string | null;
    name: string;
    total: number;
    stageIds: Set<string>;
  };
  const buckets = new Map<string, SupplierBucket>();
  for (const es of externalServices) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const esAny = es as any;
    const companyId: string | null = esAny.supplier_company_id ?? null;
    const supplierId: string | null = esAny.supplier_id ?? null;
    const placeholder: string | null = (esAny.supplier_placeholder ?? null) || null;
    if (!companyId && !supplierId && !placeholder) continue;
    const key = companyId
      ? `c:${companyId}`
      : supplierId
        ? `s:${supplierId}`
        : `p:${placeholder!.toLowerCase()}`;
    const name = es.supplier?.name ?? placeholder ?? esAny.description ?? "Supplier";
    const cost = Number(esAny.purchase_price ?? 0) * Number(esAny.quantity ?? 1);
    const cur = buckets.get(key) ?? {
      key,
      companyId,
      pmSupplierId: supplierId,
      placeholderLabel: placeholder,
      name,
      total: 0,
      stageIds: new Set<string>(),
    };
    cur.total += cost;
    if (esAny.stage_id) cur.stageIds.add(esAny.stage_id);
    buckets.set(key, cur);
  }

  const offset = Math.max(0, Number(options.paymentOffsetDays ?? 0));

  for (const bucket of buckets.values()) {
    if (bucket.total <= 0) continue;
    // Stages this supplier participates in. If none, spread across ALL stages.
    const supplierStages = bucket.stageIds.size > 0
      ? sorted.filter((s) => bucket.stageIds.has(s.id))
      : sorted;
    if (supplierStages.length === 0) continue;
    const supplierStageWeightTotal = supplierStages.reduce(
      (s, st) => s + (stageFees[st.id] ?? 0),
      0,
    );

    // Optional down-payment outflow at project_start
    if (dp > 0) {
      const dpAmt = round2((bucket.total * dp) / 100);
      items.push({
        label: `${bucket.name} — Adjudicação`,
        trigger_type: "project_start",
        amount_type: "fixed",
        amount_value: dpAmt,
        stage_id: null,
        expected_invoice_date: earliestStart,
        expected_payment_date: addDaysISO(earliestStart, offset),
        sort_order: order++,
        generator_source: "architecture_with_consultants",
        direction: "outflow",
        supplier_company_id: bucket.companyId,
        supplier_id: bucket.pmSupplierId,
        supplier_label: bucket.placeholderLabel,
      });
    }
    const remaining = round2(bucket.total * (1 - dp / 100));
    let running = 0;
    supplierStages.forEach((s, idx) => {
      const weight = stageFees[s.id] ?? 0;
      const ratio = supplierStageWeightTotal > 0
        ? weight / supplierStageWeightTotal
        : 1 / supplierStages.length;
      const overrideKey = `${bucket.key}:${s.id}`;
      const overridePct = options.supplierSplitOverrides?.[overrideKey];
      let amount = overridePct != null
        ? round2((remaining * overridePct) / 100)
        : round2(remaining * ratio);
      if (idx === supplierStages.length - 1 && overridePct == null) {
        amount = round2(remaining - running);
      }
      running += amount;
      if (amount <= 0) return;
      items.push({
        label: `${bucket.name} — ${s.name}`,
        trigger_type: "stage_end",
        amount_type: "fixed",
        amount_value: amount,
        stage_id: s.id,
        expected_invoice_date: s.end_date,
        expected_payment_date: addDaysISO(s.end_date, offset),
        sort_order: order++,
        generator_source: "architecture_with_consultants",
        direction: "outflow",
        supplier_company_id: bucket.companyId,
        supplier_id: bucket.pmSupplierId,
        supplier_label: bucket.placeholderLabel,
      });
    });
  }


  return items;
}

function midpointISO(startISO: string, endISO: string): string {
  const s = new Date(startISO + "T00:00:00Z").getTime();
  const e = new Date(endISO + "T00:00:00Z").getTime();
  const m = new Date((s + e) / 2);
  return m.toISOString().slice(0, 10);
}

function monthsBetween(startISO: string, endISO: string): string[] {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  if (end < start) return [];
  const out: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function formatYearMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsFrom(anchorISO: string, count: number): string[] {
  const start = new Date(anchorISO + "T00:00:00Z");
  const out: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  for (let i = 0; i < count; i++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

