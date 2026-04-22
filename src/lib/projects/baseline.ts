import { differenceInCalendarDays } from "date-fns";
import type { Stage } from "@/lib/projects/types";

/** A stage row (or partial) that may carry baseline columns. */
export type StageWithBaseline = Pick<
  Stage,
  "start_date" | "end_date" | "budget"
> & {
  baseline_start_date?: string | null;
  baseline_end_date?: string | null;
  baseline_budget?: number | string | null;
  baseline_target_hours?: number | string | null;
  baseline_locked_at?: string | null;
};

export type StageHealth = "on_track" | "at_risk" | "overrun" | "no_baseline";

/** Threshold (fraction) at which we flip from "on track" to "at risk". */
export const AT_RISK_THRESHOLD = 0.8;

export interface StageHealthInput {
  loggedHours: number;
  plannedHours: number; // sum of allocation hours (live planning load)
  actualCost: number;
  baselineTargetHours: number | null;
  baselineBudget: number | null;
}

/**
 * Compute a stage's health using baseline references. Falls back to
 * working-budget when no baseline is locked yet.
 */
export function computeStageHealth(input: StageHealthInput): StageHealth {
  const { loggedHours, baselineTargetHours, actualCost, baselineBudget } = input;

  // Need at least one baseline to grade health.
  if (
    (baselineTargetHours == null || baselineTargetHours <= 0) &&
    (baselineBudget == null || baselineBudget <= 0)
  ) {
    return "no_baseline";
  }

  let worst: StageHealth = "on_track";

  if (baselineTargetHours != null && baselineTargetHours > 0) {
    const ratio = loggedHours / baselineTargetHours;
    if (ratio > 1) worst = "overrun";
    else if (ratio >= AT_RISK_THRESHOLD && worst === "on_track") worst = "at_risk";
  }

  if (baselineBudget != null && baselineBudget > 0) {
    const ratio = actualCost / baselineBudget;
    if (ratio > 1) worst = "overrun";
    else if (ratio >= AT_RISK_THRESHOLD && worst === "on_track") worst = "at_risk";
  }

  return worst;
}

export interface BaselineVariance {
  startShiftDays: number; // positive = later than baseline
  endShiftDays: number;
  durationShiftDays: number;
  budgetDelta: number; // positive = over baseline
  hoursDelta: number;
}

export function computeBaselineVariance(
  stage: StageWithBaseline,
  livePlannedHours: number,
): BaselineVariance | null {
  if (
    !stage.baseline_start_date ||
    !stage.baseline_end_date ||
    stage.baseline_locked_at == null
  ) {
    return null;
  }
  const baseStart = new Date(stage.baseline_start_date);
  const baseEnd = new Date(stage.baseline_end_date);
  const liveStart = new Date(stage.start_date);
  const liveEnd = new Date(stage.end_date);
  const baseBudget = Number(stage.baseline_budget ?? 0);
  const liveBudget = Number(stage.budget ?? 0);
  const baseHours = Number(stage.baseline_target_hours ?? 0);

  const baseDur = differenceInCalendarDays(baseEnd, baseStart);
  const liveDur = differenceInCalendarDays(liveEnd, liveStart);

  return {
    startShiftDays: differenceInCalendarDays(liveStart, baseStart),
    endShiftDays: differenceInCalendarDays(liveEnd, baseEnd),
    durationShiftDays: liveDur - baseDur,
    budgetDelta: liveBudget - baseBudget,
    hoursDelta: livePlannedHours - baseHours,
  };
}

export function isBaselineLocked(stage: StageWithBaseline): boolean {
  return (
    !!stage.baseline_locked_at &&
    !!stage.baseline_start_date &&
    !!stage.baseline_end_date
  );
}

/** Visual config for stage-health badges. */
export const STAGE_HEALTH_LABEL: Record<StageHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  overrun: "Overrun",
  no_baseline: "No baseline",
};

export const STAGE_HEALTH_TONE: Record<
  StageHealth,
  { bg: string; fg: string; ring: string }
> = {
  on_track: {
    bg: "bg-emerald-500/15",
    fg: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/30",
  },
  at_risk: {
    bg: "bg-amber-500/15",
    fg: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-500/30",
  },
  overrun: {
    bg: "bg-destructive/15",
    fg: "text-destructive",
    ring: "ring-destructive/30",
  },
  no_baseline: {
    bg: "bg-muted",
    fg: "text-muted-foreground",
    ring: "ring-border",
  },
};
