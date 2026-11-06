/** Pure project-page actuals. Shared by the page and the B1 parity test so both use one path. */
import { financialResult, marginPercentage } from './financial-calculation';

export type ActualTimeRow = { stage_id: string; hours: number; snapCost: number; unsnapHours: number };
export type ActualEntryFigure = { stageId?: string; hours: number; cost: number; value: number };

/** Stage actuals: until every source has loaded the result is incomplete (NaN), never zero. */
export function stageActualsFrom(stageId: string, ready: boolean, timeRows: ActualTimeRow[] | undefined, entries: ActualEntryFigure[] | undefined) {
  if (!ready || !timeRows) return { revenue: NaN, cost: NaN, profit: NaN };
  const own = (entries ?? []).filter(e => e.stageId === stageId);
  const logged = timeRows.reduce((n, r) => n + (r.stage_id === stageId ? r.hours : 0), 0);
  const rawHours = own.reduce((n, e) => n + e.hours, 0);
  const complete = Math.abs(logged - rawHours) < 0.005;
  const snapCost = timeRows.reduce((n, r) => n + (r.stage_id === stageId ? r.snapCost : 0), 0);
  const missing = timeRows.reduce((n, r) => n + (r.stage_id === stageId ? r.unsnapHours : 0), 0);
  const cost = complete ? own.reduce((n, e) => n + e.cost, 0) : missing === 0 ? snapCost : NaN;
  const revenue = complete ? own.reduce((n, e) => n + e.value, 0) : NaN;
  return { revenue, cost, profit: financialResult(revenue, cost).profit };
}

export function projectActualTotals(input: {
  stageIds: string[]; ready: boolean; timeRows: ActualTimeRow[] | undefined; entries: ActualEntryFigure[] | undefined;
  historical: { amount: number; cost: number }; pursuitCost: number; allowedParts?: boolean[];
}) {
  const sum = input.stageIds.reduce((acc, id) => {
    const a = stageActualsFrom(id, input.ready, input.timeRows, input.entries);
    acc.revenue += a.revenue; acc.cost += a.cost; return acc;
  }, { revenue: 0, cost: 0 });
  const revenue = input.ready ? sum.revenue + input.historical.amount : NaN;
  const cost = input.ready ? sum.cost + input.historical.cost + input.pursuitCost : NaN;
  const profit = revenue - cost;
  return { revenue, cost, profit, marginPct: marginPercentage(revenue, profit, input.allowedParts) };
}

/** Server rate gating: with B1 ON, rates follow only the caller's project areas (same rule for every caller). */
export function applyB1RateAccess<T extends { cost: number; sale: number; sale100: number }>(def: T, b1: boolean, budgetAllowed: boolean, saleAllowed: boolean): T {
  if (!b1) return def;
  return { ...def, cost: budgetAllowed ? def.cost : NaN, sale: saleAllowed ? def.sale : NaN, sale100: saleAllowed ? def.sale100 : NaN };
}
