/**
 * Stage 6C — Project-level forecast metrics aggregator.
 *
 * Combines the stage-level coverage + recoverability into a single
 * project envelope. Pure.
 */
import type {
  CapacityRiskLevel,
  ProjectBaselineRow,
  ProjectForecastMetrics,
  StageCoverage,
  StageRecoverability,
} from "./types";

export function deriveCapacityRiskLevel(
  coverage_pct: number,
  overloadedCount: number,
): CapacityRiskLevel {
  if (overloadedCount > 0) return "high";
  if (coverage_pct < 50) return "high";
  if (coverage_pct < 80) return "medium";
  return "low";
}

export function computeProjectForecastMetrics(input: {
  project_id: string;
  baseline: ProjectBaselineRow | null;
  stageCoverages: StageCoverage[];
  stageRecoverabilities: StageRecoverability[];
  overloadedCollaboratorsCount: number;
}): ProjectForecastMetrics {
  const { project_id, baseline, stageCoverages, stageRecoverabilities } = input;

  const plannedFee =
    Number(baseline?.sold_fee_total ?? 0) ||
    stageRecoverabilities.reduce((a, s) => a + s.sold_fee, 0);
  const forecastFee = stageRecoverabilities.reduce((a, s) => a + s.sold_fee, 0);
  const plannedCost = stageRecoverabilities.reduce(
    (a, s) => a + s.planned_cost,
    0,
  );
  const forecastCost = plannedCost; // until actuals layer arrives.

  const plannedMarginPct =
    Number(baseline?.target_gross_margin_pct ?? NaN);
  const forecastMargin = forecastFee - forecastCost;
  const forecastMarginPct =
    forecastFee > 0 ? +((forecastMargin / forecastFee) * 100).toFixed(1) : null;

  const allocatedHours = stageCoverages.reduce(
    (a, s) => a + s.allocated_hours,
    0,
  );
  const plannedHours = stageCoverages.reduce((a, s) => a + s.planned_hours, 0);
  const remainingHours = Math.max(0, plannedHours - allocatedHours);
  const coveragePct =
    plannedHours > 0 ? +((allocatedHours / plannedHours) * 100).toFixed(1) : 0;

  const riskLevel = deriveCapacityRiskLevel(
    coveragePct,
    input.overloadedCollaboratorsCount,
  );

  return {
    project_id,
    planned_fee: +plannedFee.toFixed(2),
    forecast_fee: +forecastFee.toFixed(2),
    planned_cost: +plannedCost.toFixed(2),
    forecast_cost: +forecastCost.toFixed(2),
    planned_margin_pct: Number.isFinite(plannedMarginPct) ? plannedMarginPct : null,
    forecast_margin_pct: forecastMarginPct,
    allocated_hours: +allocatedHours.toFixed(2),
    remaining_hours: +remainingHours.toFixed(2),
    staffing_coverage_pct: coveragePct,
    capacity_risk_level: riskLevel,
  };
}
