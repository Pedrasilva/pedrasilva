/**
 * Retainer-as-monthly-template math.
 *
 * A retainer stage (stage_kind = 'retainer_monthly') represents ONE calendar
 * month of resource allocations that repeats N times. Allocations on the
 * stage are clamped to the anchor month; we compute a monthly fee from
 * those allocations and a total = monthly × N months.
 *
 * Two-way conversion between % allocation and hours/month uses a configurable
 * capacity (default 160 h/month). hours_per_day on the allocation row is
 * derived so the working-day × hpd math used by the rest of the system still
 * produces the right per-month hours.
 */
import { addDays, addMonths, endOfMonth, startOfMonth, parseISO, format } from "date-fns";
import { workingDays } from "@/lib/projects/gantt-utils";
import type { QuoteAllocationWithResource } from "./use-quote-allocations";

export const DEFAULT_RETAINER_CAPACITY_HPM = 160;
export const RETAINER_MONTH_PRESETS = [12, 18, 24] as const;

export function toIso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** First-of-month ISO date for the month containing `anchor`. */
export function anchorMonthStart(anchor: string): string {
  return toIso(startOfMonth(parseISO(anchor)));
}

/** Last-of-month ISO date for the month containing `anchor`. */
export function anchorMonthEnd(anchor: string): string {
  return toIso(endOfMonth(parseISO(anchor)));
}

/** Default anchor: first of next month (most retainers start the month after sign-off). */
export function defaultAnchorMonth(): string {
  return toIso(startOfMonth(addMonths(new Date(), 1)));
}

/** Working days (Mon–Fri) in the anchor month. Used to convert hpm→hpd. */
export function monthWorkingDays(anchor: string): number {
  const start = anchorMonthStart(anchor);
  const end = anchorMonthEnd(anchor);
  return Math.max(1, workingDays(start, end));
}

/** % allocation → hours per month, given monthly capacity. */
export function pctToHoursPerMonth(pct: number, capacityHpm = DEFAULT_RETAINER_CAPACITY_HPM): number {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return (clamped / 100) * capacityHpm;
}

/** Hours per month → % allocation. */
export function hoursPerMonthToPct(hpm: number, capacityHpm = DEFAULT_RETAINER_CAPACITY_HPM): number {
  if (capacityHpm <= 0) return 0;
  const clamped = Math.max(0, hpm || 0);
  return Math.min(100, (clamped / capacityHpm) * 100);
}

/** Hours per month → hours per day for the allocation row. */
export function hoursPerMonthToHpd(hpm: number, anchor: string): number {
  const wd = monthWorkingDays(anchor);
  return wd > 0 ? hpm / wd : 0;
}

/** Allocation row monthly hours, derived from working_days × hours_per_day. */
export function allocationMonthlyHours(a: QuoteAllocationWithResource): number {
  return workingDays(a.start_date, a.end_date) * Number(a.hours_per_day || 0);
}

/** Σ monthly hours across all allocations on this retainer stage. */
export function retainerMonthlyHours(allocs: QuoteAllocationWithResource[]): number {
  return allocs.reduce((s, a) => s + allocationMonthlyHours(a), 0);
}

/** Σ monthly fee (sale side) across all allocations. */
export function retainerMonthlyFee(allocs: QuoteAllocationWithResource[]): number {
  return allocs.reduce(
    (s, a) => s + allocationMonthlyHours(a) * Number(a.sale_rate_snapshot || 0),
    0,
  );
}

/** Σ monthly cost (cost side) across all allocations. */
export function retainerMonthlyCost(allocs: QuoteAllocationWithResource[]): number {
  return allocs.reduce(
    (s, a) => s + allocationMonthlyHours(a) * Number(a.cost_rate_snapshot || 0),
    0,
  );
}

export function retainerTotalBudget(monthlyFee: number, months: number): number {
  return monthlyFee * Math.max(0, months || 0);
}

/** Pretty month label for headers, e.g. "Jul 2026". Uses the user's locale via toLocaleDateString. */
export function formatAnchorMonth(anchor: string, locale = "en"): string {
  return parseISO(anchor).toLocaleDateString(locale, {
    month: "short",
    year: "numeric",
  });
}

/** Shift an anchor month by +/- N months and return the first-of-month ISO. */
export function shiftAnchor(anchor: string, deltaMonths: number): string {
  return toIso(startOfMonth(addMonths(parseISO(anchor), deltaMonths)));
}

/** End-date of a retainer block: anchor + months - 1 day (for proposal text). */
export function retainerSeriesEnd(anchor: string, months: number): string {
  const end = endOfMonth(addMonths(parseISO(anchor), Math.max(0, months - 1)));
  return toIso(end);
}

/** Convenience for callers that want a guaranteed range pair. */
export function anchorMonthRange(anchor: string): { start: string; end: string } {
  return { start: anchorMonthStart(anchor), end: anchorMonthEnd(anchor) };
}

// Silence unused import warning if addDays isn't referenced elsewhere in this module.
void addDays;
