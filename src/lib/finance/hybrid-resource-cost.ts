// Hybrid Resource Cost Engine (Step 2).
//
// Purpose: expose a SINGLE source of truth for how a collaborator's
// contractual capacity and monthly company cost are attributed between
// Back Office (overhead) and Project (recoverable capacity) buckets.
//
// Rules (mirror the spec):
//   - resource_classification = "project"    → backoffice_pct = 0,   project_pct = 100
//   - resource_classification = "backoffice" → backoffice_pct = 100, project_pct = 0
//   - resource_classification = "hybrid"     → use collaborator.backoffice_pct (0–100),
//                                              project_pct = 100 - backoffice_pct
//
// Critical invariants:
//   - FTE stays based on contractual schedule (daily_hours × days_per_week).
//     The hybrid split NEVER reduces FTE and NEVER splits a collaborator
//     into two records.
//   - Monthly payroll cost stays the SAME amount (we never reduce it).
//     The split is a managerial *attribution* between buckets.
//   - Project P&L on ACTUAL time entries keeps using `hours × cost_rate`.
//     Do NOT discount cost_rate by project_pct when a hybrid person logs
//     real project time — the planning split is for capacity forecasting
//     and expected attribution only.
//
// This helper is intentionally narrow: it does not touch pm_expenses,
// pm_materials, financial taxonomies or project P&L logic.

import { computeCollaboratorFte } from "@/lib/hr/fte";
import {
  computeMonthlyCompanyCost,
  type MonthlyCompanyCost,
} from "@/lib/finance/salary-cost";
import type { Snapshot } from "@/lib/salary";

export type ResourceClassification = "project" | "backoffice" | "hybrid";

/** Minimal shape this engine needs from a collaborator record. */
export type ResourceSplitInput = {
  resource_classification?: ResourceClassification | string | null;
  backoffice_pct?: number | null;
  daily_hours?: number | null;
  days_per_week?: number | null;
};

export type ResourceSplit = {
  resource_classification: ResourceClassification;
  backoffice_pct: number; // 0–100
  project_pct: number;    // 0–100, always = 100 - backoffice_pct
  fte: number;            // contractual FTE, unchanged by the split
  bo_fte_equivalent: number;       // fte × backoffice_pct / 100
  project_fte_equivalent: number;  // fte × project_pct / 100
};

export type SplitMonthlyCost = {
  total_monthly_cost: number;       // unchanged payroll cost
  backoffice_cost: number;          // attribution to BO bucket
  project_capacity_cost: number;    // attribution to Project capacity bucket
  backoffice_pct: number;
  project_pct: number;
};

function clampPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function normalizeClassification(
  raw: ResourceClassification | string | null | undefined,
): ResourceClassification {
  if (raw === "backoffice" || raw === "hybrid" || raw === "project") return raw;
  return "project";
}

/**
 * Resolve the canonical resource split for a collaborator.
 * Always returns a valid split where bo_pct + project_pct = 100.
 */
export function getResourceSplit(
  collaborator: ResourceSplitInput,
  standardDailyHours = 8,
): ResourceSplit {
  const classification = normalizeClassification(collaborator.resource_classification);
  let boPct: number;
  if (classification === "project") boPct = 0;
  else if (classification === "backoffice") boPct = 100;
  else boPct = clampPct(collaborator.backoffice_pct);

  const projectPct = 100 - boPct;
  const fte = computeCollaboratorFte(
    collaborator.daily_hours,
    collaborator.days_per_week,
    standardDailyHours,
  );

  return {
    resource_classification: classification,
    backoffice_pct: boPct,
    project_pct: projectPct,
    fte,
    bo_fte_equivalent: (fte * boPct) / 100,
    project_fte_equivalent: (fte * projectPct) / 100,
  };
}

/**
 * Split a monthly company cost between Back Office and Project capacity
 * according to the collaborator's resource classification.
 *
 * The total is preserved exactly: payroll/expense reality is unchanged —
 * only the managerial attribution differs.
 */
export function splitMonthlyCompanyCost(
  collaborator: ResourceSplitInput,
  monthlyCost: number,
): SplitMonthlyCost {
  const split = getResourceSplit(collaborator);
  const safeTotal = Number.isFinite(monthlyCost) && monthlyCost > 0 ? monthlyCost : 0;
  const boCost = (safeTotal * split.backoffice_pct) / 100;
  return {
    total_monthly_cost: safeTotal,
    backoffice_cost: boCost,
    project_capacity_cost: safeTotal - boCost,
    backoffice_pct: split.backoffice_pct,
    project_pct: split.project_pct,
  };
}

/**
 * Convenience: derive the monthly company cost from a salary snapshot and
 * split it. Returns null if no snapshot is supplied so callers can render
 * "—" cleanly.
 */
export function splitMonthlyCompanyCostFromSnapshot(
  collaborator: ResourceSplitInput,
  snapshot: Snapshot | null | undefined,
): (SplitMonthlyCost & { cost: MonthlyCompanyCost }) | null {
  const cost = computeMonthlyCompanyCost(snapshot);
  if (!cost) return null;
  const split = splitMonthlyCompanyCost(collaborator, cost.monthlyAverage);
  return { ...split, cost };
}

/**
 * Expected recoverable project hours per week for FORECASTING / capacity
 * planning when no actual time entries exist yet.
 *
 *   weekly_capacity = daily_hours × days_per_week
 *   expected_project_hours = weekly_capacity × project_pct / 100
 *
 * IMPORTANT: this is a planning figure only. Real project costing must use
 * actual logged hours × cost_rate — do NOT discount the cost rate by
 * project_pct when the person logs real project time.
 */
export function expectedProjectCapacityHoursPerWeek(
  collaborator: ResourceSplitInput,
): number {
  const split = getResourceSplit(collaborator);
  const dh = Number(collaborator.daily_hours);
  const dpw = Number(collaborator.days_per_week);
  const safeDh = Number.isFinite(dh) && dh > 0 ? dh : 8;
  const safeDpw = Number.isFinite(dpw) && dpw > 0 ? dpw : 5;
  const weekly = safeDh * safeDpw;
  return (weekly * split.project_pct) / 100;
}

/**
 * Aggregate hybrid attribution across a population. Pass each collaborator
 * with their current effective monthly company cost (0 if unknown).
 */
export function aggregateResourceSplit(
  rows: Array<{ collaborator: ResourceSplitInput; monthlyCost: number }>,
): {
  totalFte: number;
  boFteEquivalent: number;
  projectFteEquivalent: number;
  totalMonthlyCost: number;
  boMonthlyCost: number;
  projectCapacityMonthlyCost: number;
} {
  let totalFte = 0;
  let boFte = 0;
  let projFte = 0;
  let totalCost = 0;
  let boCost = 0;
  let projCost = 0;

  for (const row of rows) {
    const split = getResourceSplit(row.collaborator);
    totalFte += split.fte;
    boFte += split.bo_fte_equivalent;
    projFte += split.project_fte_equivalent;
    const costSplit = splitMonthlyCompanyCost(row.collaborator, row.monthlyCost);
    totalCost += costSplit.total_monthly_cost;
    boCost += costSplit.backoffice_cost;
    projCost += costSplit.project_capacity_cost;
  }

  return {
    totalFte,
    boFteEquivalent: boFte,
    projectFteEquivalent: projFte,
    totalMonthlyCost: totalCost,
    boMonthlyCost: boCost,
    projectCapacityMonthlyCost: projCost,
  };
}
