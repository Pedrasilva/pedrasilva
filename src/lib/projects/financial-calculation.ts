/** Read-only financial primitives. NaN means incomplete, never free labour. */
import { workingDays } from './gantt-utils';
import { lockedCostRate } from './use-default-rates';
import { retainerCostRate } from './retainer-cost';

export function financialResult(value: number, cost: number) {
  const profit = value - cost;
  return { value, cost, profit, marginPct: Number.isFinite(profit) && value > 0 ? profit / value * 100 : null };
}

export function plannedAllocationFigures(a: {
  start_date: string; end_date: string; hours_per_day: number | string | null;
  planning_removed_at?: string | null; allocation_percentage?: number | null;
}, rates: { cost: number; sale: number }, holidays?: ReadonlySet<string>, dailyHours = 8) {
  const hpd = Number(a.hours_per_day) || (Number(a.allocation_percentage) || 0) / 100 * dailyHours;
  const hours = a.planning_removed_at ? 0 : workingDays(a.start_date, a.end_date, holidays) * hpd;
  const cost = hours === 0 ? 0 : rates.cost > 0 ? hours * rates.cost : NaN;
  const value = hours === 0 ? 0 : rates.sale > 0 ? hours * rates.sale : NaN;
  return { hours, ...financialResult(value, cost) };
}

export interface FinancialEntry {
  id?: string; user_id?: string; task_id?: string | null; pm_stage_id?: string | null;
  hours: number; billable: boolean; entry_type?: string;
  cost_rate_snapshot?: number | string | null; sale_rate_snapshot?: number | string | null;
}

export function entryStageId(e: FinancialEntry, taskToStage: ReadonlyMap<string, string>): string | undefined {
  return e.pm_stage_id ?? (e.task_id ? taskToStage.get(e.task_id) : undefined);
}

export function loggedEntryFigures(e: FinancialEntry, rates: { cost: number; sale: number }, retainer = false) {
  const hours = Number(e.hours) || 0;
  if (e.entry_type === 'non_working') return { hours: 0, billableHours: 0, value: 0, cost: 0, profit: 0, marginPct: null, estimatedCost: false, estimatedValue: false };
  const billableHours = e.billable && (e.entry_type == null || e.entry_type === 'project') ? hours : 0;
  const costRate = retainer ? retainerCostRate(e.cost_rate_snapshot) : lockedCostRate(e.cost_rate_snapshot, rates.cost > 0 ? rates.cost : NaN);
  const savedSale = e.sale_rate_snapshot == null ? NaN : Number(e.sale_rate_snapshot);
  const sale = Number.isFinite(savedSale) && savedSale >= 0 ? savedSale : retainer ? NaN : rates.sale > 0 ? rates.sale : NaN;
  const cost = hours === 0 ? 0 : hours * costRate;
  const value = billableHours === 0 ? 0 : billableHours * sale;
  return { hours, billableHours, ...financialResult(value, cost), estimatedCost: !retainer && e.cost_rate_snapshot == null && Number.isFinite(cost), estimatedValue: billableHours > 0 && !Number.isFinite(savedSale) && Number.isFinite(value) };
}

/** Remaining plan is an estimate, not a measured percentage of completion. */
export function completionForecast(input: { plannedHours: number; plannedCost: number; plannedValue: number; loggedHours: number; actualCost: number; earnedValue: number; done: boolean }) {
  const remainingHours = input.done ? 0 : Math.max(0, input.plannedHours - input.loggedHours);
  const fraction = input.plannedHours > 0 ? remainingHours / input.plannedHours : 0;
  const cost = input.actualCost + (fraction === 0 ? 0 : input.plannedCost * fraction);
  const value = input.earnedValue + (fraction === 0 ? 0 : input.plannedValue * fraction);
  return { remainingHours, ...financialResult(value, cost) };
}