import { plannedAllocationFigures } from "@/lib/projects/financial-calculation";
import { effectiveRates, type DefaultRateInfo } from "@/lib/projects/use-default-rates";
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
  defaultRates?: Map<string, DefaultRateInfo>,
): StageRecoverability {
  const soldFee =
    Number(baseline?.sold_fee ?? 0) ||
    Number(stage.budget ?? 0) ||
    0;

  let plannedCost = 0;
  for (const a of allocations) {
    if (a.stage_id !== stage.id) continue;
    const resource = resourcesById.get(a.resource_id);
    const rates = resource ? effectiveRates(resource, defaultRates) : {cost:NaN,sale:NaN};
    plannedCost += plannedAllocationFigures(a,rates,undefined,(Number(resource?.weekly_capacity) || 40)/5).cost;
  }

  const margin = soldFee - plannedCost;
  const marginPct = Number.isFinite(plannedCost) && soldFee > 0 ? +((margin / soldFee) * 100).toFixed(1) : null;
  const recoverabilityPct =
    Number.isFinite(plannedCost) && plannedCost > 0 ? +((soldFee / plannedCost) * 100).toFixed(1) : null;

  return {
    project_stage_id: stage.id,
    sold_fee: soldFee,
    planned_cost: plannedCost,
    planned_margin: margin,
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
    margin_pct: Number.isFinite(margin) && fee > 0 ? +((margin / fee) * 100).toFixed(1) : null,
  };
}
