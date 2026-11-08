import type { StageWithAllocations } from './types';
import { allocationCost } from './gantt-utils';
import { effectiveCostRate } from './use-default-rates';

export function visibleGanttNumber(value: number | null | undefined, allowed: boolean): number {
  return allowed && value != null && Number.isFinite(value) ? value : NaN;
}

/** Project budget counted once: retainer months are a breakdown of their parent; summary parents roll up children. */
export function ganttProjectBudget(stages: StageWithAllocations[]): number {
  const kept = stages.filter((s) => (s as { stage_kind?: string }).stage_kind !== 'retainer_month');
  if (!kept.length) return NaN;
  const parents = new Set(kept.map((s) => (s as { parent_stage_id?: string | null }).parent_stage_id).filter(Boolean));
  return kept.filter((s) => !parents.has(s.id)).reduce((sum, s) => sum + visibleGanttNumber(s.budget, true), 0);
}

/** Absence/denial must survive empty allocations and parent rollups. */
export function ganttProjectFigures(stages: StageWithAllocations[], allowed: boolean, rates: Parameters<typeof effectiveCostRate>[2]) {
  if (!allowed || !stages.length) return { cost: NaN, budget: NaN };
  const figures = stages.reduce((sum, stage) => ({
    budget: 0,
    cost: sum.cost + stage.allocations.reduce((cost, a) => cost + allocationCost({
      start_date: a.start_date, end_date: a.end_date, hours_per_day: Number(a.hours_per_day),
      hourly_rate: visibleGanttNumber(effectiveCostRate(a.resource.cost_rate, a.resource.id, rates, !!a.resource.hourly_rate_is_override), a.resource.cost_rate != null && Number.isFinite(a.resource.cost_rate)),
    }), 0),
  }), { cost: 0, budget: 0 });
  return { cost: figures.cost, budget: ganttProjectBudget(stages) };
}

/** Exclude denied projects; no permitted projects is unavailable, not zero. */
export function sumAllowedGanttValues(rows: { allowed: boolean; value: number }[]): number {
  const allowed = rows.filter(row => row.allowed);
  return allowed.length ? allowed.reduce((total, row) => total + visibleGanttNumber(row.value, true), 0) : NaN;
}