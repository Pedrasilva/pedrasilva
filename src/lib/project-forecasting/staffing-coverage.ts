/**
 * Stage 6C — Staffing coverage.
 *
 * Cross-reference Stage 6B's planned/estimated hours vs the daily forecast
 * derived from real pm_allocations. Pure functions.
 */
import type {
  PlaceholderRow,
  StageBaselineRow,
  StageCoverage,
} from "./types";

export function computeStageCoverage(
  stageId: string,
  baseline: StageBaselineRow | undefined,
  placeholders: PlaceholderRow[],
  allocatedHoursByStage: Map<string, number>,
): StageCoverage {
  // Prefer baseline.estimated_hours when present; otherwise fall back to the
  // sum of placeholder expected_hours for the stage.
  let planned = Number(baseline?.estimated_hours ?? 0);
  if (!planned) {
    planned = placeholders
      .filter((p) => p.project_stage_id === stageId)
      .reduce((acc, p) => acc + (Number(p.expected_hours) || 0), 0);
  }
  const allocated = allocatedHoursByStage.get(stageId) ?? 0;
  const remaining = Math.max(0, planned - allocated);
  const coverage = planned > 0 ? (allocated / planned) * 100 : 0;
  return {
    project_stage_id: stageId,
    planned_hours: planned,
    allocated_hours: allocated,
    remaining_hours: remaining,
    staffing_coverage_pct: +coverage.toFixed(1),
    over_allocated: planned > 0 && allocated > planned * 1.05,
  };
}

export function aggregateCoverage(stages: StageCoverage[]): {
  planned: number;
  allocated: number;
  remaining: number;
  coverage_pct: number;
} {
  const planned = stages.reduce((a, s) => a + s.planned_hours, 0);
  const allocated = stages.reduce((a, s) => a + s.allocated_hours, 0);
  const remaining = Math.max(0, planned - allocated);
  return {
    planned,
    allocated,
    remaining,
    coverage_pct: planned > 0 ? +((allocated / planned) * 100).toFixed(1) : 0,
  };
}
