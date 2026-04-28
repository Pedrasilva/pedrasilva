/**
 * Financial rollup for a quote.
 *
 * Mirrors the project rollups in src/lib/projects/financial-rollups.ts but
 * works against quote_* tables (snapshot rates, no real timesheet hours yet).
 *
 * For internal allocations we approximate billable hours from the date range
 * × hours_per_day × allocation_percentage (default 100%). External services
 * use the exact same purchase/sale * quantity model as pm_materials.
 *
 * pricing_multiplier is applied to the SALE side only — it scales fees
 * (internal + external) without inflating costs.
 */
import {
  rollupExternalServices,
  toNum,
  type FinancialsRow,
} from "@/lib/projects/financial-rollups";
import type { QuoteAllocationWithResource } from "./use-quote-allocations";
import type { QuoteExternalServiceWithSupplier } from "./use-quote-external-services";
import {
  consultancyBlockValue,
  consultancyMinimumHours,
  retainerMonthlyEstimate,
  type TimeBasedSettings,
} from "./time-based-settings";

/** Calendar-day count (inclusive). Weekends not excluded — quotes are forecast,
 *  not actuals; using calendar days keeps the maths predictable and consistent
 *  with how `pm_allocations.hours_per_day` is interpreted in planning. */
function dayCount(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  return Math.floor((e - s) / 86_400_000) + 1;
}

export function quoteAllocationLine(a: QuoteAllocationWithResource): {
  hours: number;
  cost: number;
  revenue: number;
  profit: number;
} {
  const days = dayCount(a.start_date, a.end_date);
  const hpd = toNum(a.hours_per_day, 8);
  const pct =
    a.allocation_percentage === null || a.allocation_percentage === undefined
      ? 1
      : toNum(a.allocation_percentage) / 100;
  const hours = days * hpd * pct;
  const cost = hours * toNum(a.cost_rate_snapshot);
  const revenue = hours * toNum(a.sale_rate_snapshot);
  return { hours, cost, revenue, profit: revenue - cost };
}

export function rollupQuoteAllocations(
  rows: QuoteAllocationWithResource[],
): FinancialsRow & { hours: number } {
  let cost = 0;
  let revenue = 0;
  let hours = 0;
  for (const a of rows) {
    const line = quoteAllocationLine(a);
    cost += line.cost;
    revenue += line.revenue;
    hours += line.hours;
  }
  return {
    budget: revenue,
    value: revenue,
    cost,
    profit: revenue - cost,
    invoiced: 0,
    hours,
  };
}

export interface QuoteFinancialSummary {
  internal: FinancialsRow & { hours: number };
  external: FinancialsRow;
  total: FinancialsRow;
  pricingMultiplier: number;
  /** Total revenue with pricing_multiplier applied to the sale side. */
  totalFee: number;
  /** profit / revenue, on the multiplier-adjusted figures. 0 when revenue=0. */
  effectiveMargin: number;
}

export type QuoteCategoryHint = "project" | "time_based" | "retainer" | "consultancy";

export function rollupQuote({
  allocations,
  externalServices,
  pricingMultiplier = 1,
  category,
  timeBasedSettings,
}: {
  allocations: QuoteAllocationWithResource[];
  externalServices: QuoteExternalServiceWithSupplier[];
  pricingMultiplier?: number;
  /** When set to "time_based"/"consultancy" or "retainer", the rollup uses
   *  the saved fee_proposals.time_based_settings to compute a meaningful
   *  totalFee instead of relying on stage allocations (which don't exist
   *  for time-based / retainer quotes). */
  category?: QuoteCategoryHint;
  timeBasedSettings?: TimeBasedSettings | null;
}): QuoteFinancialSummary {
  const internal = rollupQuoteAllocations(allocations);
  const external = rollupExternalServices(externalServices);

  const m = pricingMultiplier > 0 ? pricingMultiplier : 1;
  let internalFee = internal.value * m;
  const externalFee = external.value * m;
  const totalCost = internal.cost + external.cost;

  // Time-based / retainer: derive fee from the saved commercial settings
  // when allocations are empty so the financial summary is not blank.
  const isTimeBased = category === "time_based" || category === "consultancy";
  const isRetainer = category === "retainer";
  if (
    timeBasedSettings &&
    (isTimeBased || isRetainer) &&
    internalFee === 0
  ) {
    if (timeBasedSettings.kind === "consultancy_hours_package") {
      // Block value = hourly_rate × hours_block (full package fee).
      internalFee = consultancyBlockValue(timeBasedSettings) * m;
      // Reflect the implied "billable hours" for the Internal cell.
      internal.hours = timeBasedSettings.hours_block ?? 0;
    } else if (timeBasedSettings.kind === "construction_retainer") {
      const monthly = retainerMonthlyEstimate(timeBasedSettings);
      const months = timeBasedSettings.construction_duration_months ?? null;
      // If duration set, total = monthly × months. Otherwise monthly only.
      internalFee = (months && months > 0 ? monthly * months : monthly) * m;
      // Sum of resources hours/month × months (if duration set).
      const hpm = timeBasedSettings.monthly_resources.reduce(
        (s, r) => s + (Number(r.hours_per_month) || 0),
        0,
      );
      internal.hours = months && months > 0 ? hpm * months : hpm;
    }
    // Mirror the imputed fee back into the internal row so per-side cells
    // (Internal Fee, Internal Profit) display correctly.
    internal.value = internalFee / m;
    internal.budget = internal.value;
    internal.profit = internal.value - internal.cost;
  }

  const totalFee = internalFee + externalFee;
  const totalProfit = totalFee - totalCost;

  const total: FinancialsRow = {
    budget: totalFee,
    value: totalFee,
    cost: totalCost,
    profit: totalProfit,
    invoiced: 0,
  };

  const effectiveMargin = totalFee > 0 ? totalProfit / totalFee : 0;

  return {
    internal,
    external,
    total,
    pricingMultiplier: m,
    totalFee,
    effectiveMargin,
  };
}
