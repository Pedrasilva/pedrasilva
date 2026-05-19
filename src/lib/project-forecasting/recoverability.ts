/**
 * Stage 6C — Recoverability forecast.
 *
 * Computes planned revenue/cost/margin per stage and the project as a whole
 * using:
 *  - sold_fee from Stage 6B baselines (or pm_stage.budget as fallback)
 *  - cost = allocated_hours × resource.cost_rate (HR-managed; never invented)
 *
 * Pure: no DB writes, no accounting entries.
 */
import type {
  AllocationRow,
  ResourceRow,
  StageBaselineRow,
  StageRecoverability,
  StageRow,
} from "./types";

export function computeStageRecoverability(
  stage: StageRow,
  baseline: StageBaselineRow | undefined,
  allocations: AllocationRow[],
  resourcesById: Map<string, ResourceRow>,
): StageRecoverability {
  const soldFee =
    Number(baseline?.sold_fee ?? 0) ||
    Number(stage.budget ?? 0) ||
    0;

  // Planned cost = Σ allocation.hours_per_day × business_days × resource.cost_rate
  // We approximate business_days as inclusive day-span × 5/7 — good enough
  // for forecast-level visibility (real reporting uses actual entries).
  let plannedCost = 0;
  for (const a of allocations) {
    if (a.stage_id !== stage.id) continue;
    const start = new Date(a.start_date);
    const end = new Date(a.end_date);
    const days = Math.max(
      0,
      Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1,
    );
    const businessDays = Math.round(days * (5 / 7));
    const hours = businessDays * (Number(a.hours_per_day) || 0);
    const res = resourcesById.get(a.resource_id);
    const costRate = Number(res?.cost_rate ?? 0);
    plannedCost += hours * costRate;
  }

  const margin = soldFee - plannedCost;
  const marginPct = soldFee > 0 ? +((margin / soldFee) * 100).toFixed(1) : null;
  const recoverabilityPct =
    plannedCost > 0 ? +((soldFee / plannedCost) * 100).toFixed(1) : null;

  return {
    project_stage_id: stage.id,
    sold_fee: soldFee,
    planned_cost: +plannedCost.toFixed(2),
    planned_margin: +margin.toFixed(2),
    planned_margin_pct: marginPct,
    recoverability_pct: recoverabilityPct,
  };
}

export function aggregateRecoverability(stages: StageRecoverability[]): {
  fee: number;
  cost: number;
  margin: number;
  margin_pct: number | null;
} {
  const fee = stages.reduce((a, s) => a + s.sold_fee, 0);
  const cost = stages.reduce((a, s) => a + s.planned_cost, 0);
  const margin = fee - cost;
  return {
    fee,
    cost,
    margin,
    margin_pct: fee > 0 ? +((margin / fee) * 100).toFixed(1) : null,
  };
}
