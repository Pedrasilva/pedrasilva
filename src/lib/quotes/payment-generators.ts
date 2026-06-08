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

export type GeneratorKind = "milestones" | "thirds" | "monthly" | "by_stage_billing";

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
export function generateByStageBilling(
  stages: QuoteStage[],
  stageFees: Record<string, number>,
): GeneratorItem[] {
  if (stages.length === 0) return [];
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const items: GeneratorItem[] = [];
  let order = 0;
  for (const s of sorted) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sa = s as any;
    const stageKind = (sa.stage_kind ?? "regular") as "regular" | "retainer_monthly";

    // New monthly-retainer model: N copies of monthly_fee starting at anchor.
    if (stageKind === "retainer_monthly") {
      const months = Math.max(1, Math.min(120, Number(sa.retainer_months ?? 0) || 0));
      const anchor = (sa.retainer_anchor_month as string | null) ?? s.start_date;
      const total = Number(stageFees[s.id] ?? sa.budget ?? 0);
      if (!months || !anchor) continue;
      const monthly = round2(total / months);
      const series = monthsFrom(anchor, months);
      series.forEach((m, i) => {
        const amt = i === series.length - 1
          ? round2(total - monthly * (series.length - 1))
          : monthly;
        items.push({
          label: `${s.name} — ${formatYearMonth(m)} (retainer)`,
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
      continue;
    }

    const model = (sa.billing_model ?? "stage") as "stage" | "monthly" | "retainer";
    const retainer = Number(sa.retainer_monthly_amount ?? 0);
    if (model === "retainer") {
      const months = monthsBetween(s.start_date, s.end_date);
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
      const months = monthsBetween(s.start_date, s.end_date);
      if (months.length === 0) continue;
      const fee = stageFees[s.id] ?? 0;
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
      // 'stage' — single payment at stage end
      items.push({
        label: s.name,
        trigger_type: "stage_end",
        amount_type: "fixed",
        amount_value: round2(stageFees[s.id] ?? 0),
        stage_id: s.id,
        expected_invoice_date: s.end_date,
        expected_payment_date: null,
        sort_order: order++,
        generator_source: "by_stage_billing",
      });
    }
  }

  return items;
}

// ----------------- helpers -----------------

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

