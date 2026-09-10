/**
 * Stage envelope — the single derived view of "how much of this stage is
 * already committed by planned task allocations".
 *
 * Nothing here is stored: every number is derived from data that already
 * exists.
 *
 *   Stage Sale Value        = pm_stages.budget (agreed client value)
 *   Target Margin           = stage commercial baseline → project baseline → 50%
 *   Target Planned Cost     = sale value × (1 − target margin)
 *   Capacity (hours)        = baseline_target_hours, else sale value ÷ avg sale rate
 *   Allocated hours         = Σ workingDays(start,end) × hours_per_day
 *   Planned Cost            = Σ allocation hours × that resource's effective cost rate
 *   Remaining Target Cost   = target planned cost − planned cost
 *   Projected Margin        = (sale value − planned cost) ÷ sale value
 *
 * Intentional asymmetry (confirmed business rule): stage hour capacity uses
 * the team AVERAGE SALE rate, while task planned cost uses each assigned
 * resource's EFFECTIVE COST rate.
 *
 * Planned allocation is not actual logged time — actuals live in
 * use-stage-budget-control.ts and are untouched here.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { allocationHours } from "@/lib/projects/gantt-utils";
import { effectiveCostRate, type DefaultRateInfo } from "@/lib/projects/use-default-rates";

/** PSA management default when no commercial baseline exists. */
export const DEFAULT_TARGET_MARGIN = 0.5;

export interface EnvelopeAllocation {
  id: string;
  start_date: string;
  end_date: string;
  hours_per_day: number | string;
  resource: {
    id: string;
    cost_rate?: number | string | null;
    hourly_rate_is_override?: boolean | null;
  };
}

export interface EnvelopeSnapshot {
  allocatedHours: number;
  plannedCost: number;
  remainingHours: number;
  remainingCost: number;
  /** Fraction (0.8 = 80%). null when the stage has no sale value. */
  projectedMargin: number | null;
  /** Percentage points vs. the target margin. null when margin is unknown. */
  marginVariancePts: number | null;
}

export interface StageEnvelope {
  saleValue: number;
  targetMargin: number;
  targetCost: number;
  capacityHours: number;
  /** Envelope without the draft task (and without the task being edited). */
  before: EnvelopeSnapshot;
  /** Envelope including the draft task. */
  after: EnvelopeSnapshot;
  /** The draft task itself. */
  task: { hours: number; cost: number };
  /** Hours the draft pushes the stage past its capacity (0 when inside). */
  hoursOverBy: number;
  /** Euros the draft pushes the stage past its target cost (0 when inside). */
  costOverBy: number;
}

export function envelopeAllocationHours(a: EnvelopeAllocation): number {
  return allocationHours({
    start_date: a.start_date,
    end_date: a.end_date,
    hours_per_day: Number(a.hours_per_day) || 0,
  });
}

export function allocationCostRate(
  a: EnvelopeAllocation,
  defaultRates: Map<string, DefaultRateInfo> | undefined,
): number {
  return effectiveCostRate(
    a.resource.cost_rate == null ? null : Number(a.resource.cost_rate),
    a.resource.id,
    defaultRates,
    a.resource.hourly_rate_is_override == null
      ? undefined
      : !!a.resource.hourly_rate_is_override,
  );
}

function snapshot(
  saleValue: number,
  targetCost: number,
  capacityHours: number,
  targetMargin: number,
  hours: number,
  cost: number,
): EnvelopeSnapshot {
  const projectedMargin = saleValue > 0 ? (saleValue - cost) / saleValue : null;
  return {
    allocatedHours: hours,
    plannedCost: cost,
    remainingHours: capacityHours - hours,
    remainingCost: targetCost - cost,
    projectedMargin,
    marginVariancePts:
      projectedMargin == null ? null : (projectedMargin - targetMargin) * 100,
  };
}

export function computeStageEnvelope(input: {
  saleValue: number;
  baselineTargetHours?: number | null;
  avgSaleRate: number;
  allocations: EnvelopeAllocation[];
  defaultRates: Map<string, DefaultRateInfo> | undefined;
  /** Fraction, e.g. 0.5. */
  targetMargin: number;
  /** Allocation currently being edited — excluded so edits never double-count. */
  excludeAllocationId?: string | null;
  /** The task being added / edited, as it currently stands in the form. */
  draft?: { hours: number; costRate: number } | null;
}): StageEnvelope {
  const saleValue = Number(input.saleValue) || 0;
  const targetMargin = input.targetMargin;
  const targetCost = saleValue * (1 - targetMargin);
  const baseline = Number(input.baselineTargetHours ?? 0);
  const capacityHours =
    baseline > 0
      ? baseline
      : saleValue > 0 && input.avgSaleRate > 0
        ? saleValue / input.avgSaleRate
        : 0;

  let hours = 0;
  let cost = 0;
  for (const a of input.allocations) {
    if (input.excludeAllocationId && a.id === input.excludeAllocationId) continue;
    const h = envelopeAllocationHours(a);
    hours += h;
    cost += h * allocationCostRate(a, input.defaultRates);
  }

  const draftHours = Math.max(0, input.draft?.hours ?? 0);
  const draftCost = draftHours * Math.max(0, input.draft?.costRate ?? 0);

  const before = snapshot(saleValue, targetCost, capacityHours, targetMargin, hours, cost);
  const after = snapshot(
    saleValue,
    targetCost,
    capacityHours,
    targetMargin,
    hours + draftHours,
    cost + draftCost,
  );

  return {
    saleValue,
    targetMargin,
    targetCost,
    capacityHours,
    before,
    after,
    task: { hours: draftHours, cost: draftCost },
    hoursOverBy: capacityHours > 0 ? Math.max(0, after.allocatedHours - capacityHours) : 0,
    costOverBy: targetCost > 0 ? Math.max(0, after.plannedCost - targetCost) : 0,
  };
}

interface TargetMargins {
  /** Fraction per stage id. */
  byStage: Map<string, number>;
  /** Fraction — project-level default. */
  project: number;
}

function toFraction(pct: number | null | undefined): number | null {
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Baselines store percentages (35 = 35%); tolerate fractions too.
  return n > 1 ? n / 100 : n;
}

/**
 * Target margin per stage, resolved from the existing commercial baselines.
 * Stage baseline → project baseline → PSA default (50%).
 */
export function useStageTargetMargins(projectId: string) {
  return useQuery({
    queryKey: ["pm-stage-target-margins", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<TargetMargins> => {
      const [stageRes, projectRes] = await Promise.all([
        supabase
          .from("pm_stage_commercial_baselines")
          .select("project_stage_id, target_margin_pct, updated_at")
          .eq("project_id", projectId)
          .order("updated_at", { ascending: true }),
        supabase
          .from("pm_project_commercial_baselines")
          .select("target_gross_margin_pct, updated_at")
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(1),
      ]);

      const project =
        toFraction(
          (projectRes.data?.[0] as { target_gross_margin_pct: number | null } | undefined)
            ?.target_gross_margin_pct,
        ) ?? DEFAULT_TARGET_MARGIN;

      const byStage = new Map<string, number>();
      for (const row of (stageRes.data ?? []) as Array<{
        project_stage_id: string;
        target_margin_pct: number | null;
      }>) {
        const f = toFraction(row.target_margin_pct);
        if (f != null) byStage.set(row.project_stage_id, f);
      }
      return { byStage, project };
    },
  });
}

/** Resolve the target margin for one stage from the query result. */
export function resolveTargetMargin(
  margins: TargetMargins | undefined,
  stageId: string,
): number {
  return margins?.byStage.get(stageId) ?? margins?.project ?? DEFAULT_TARGET_MARGIN;
}
