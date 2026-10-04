/**
 * Budget vs consumption — pure calculation (no Supabase calls).
 *
 * Shared by the projects dashboard ("Orçamento" / "Custo real") and the
 * Reports → Budget vs consumption report.
 *
 *   budget      = Σ stage.budget
 *   actual cost = labour (hours × locked cost-rate snapshot, fallback current
 *                 cost rate of the stage's first allocation resource)
 *               + pre-contract pursuit cost + materials purchase + expenses
 */
import { lockedCostRate } from "@/lib/projects/use-default-rates";

export interface CostEntry {
  task_id: string | null;
  hours: number;
  billable: boolean;
  cost_rate_snapshot: number | null;
}

export interface StageLite {
  id: string;
  project_id: string;
  billing_model?: string | null;
  allocations: { resource_id: string }[];
}

export interface StageActual {
  laborCost: number;
  loggedHours: number;
  nonBillableHours: number;
  /** Billable hours × sale rate on hourly (time-and-materials) stages. */
  tmRevenue: number;
}

const emptyActual = (): StageActual => ({ laborCost: 0, loggedHours: 0, nonBillableHours: 0, tmRevenue: 0 });

/** Labour actuals per stage, using the dashboard's rate rules. */
export function stageActuals(input: {
  entries: CostEntry[];
  taskToStage: Map<string, string>;
  stageById: Map<string, StageLite>;
  costRateFor: (resourceId: string) => number;
  saleRateFor: (resourceId: string) => number;
}): Map<string, StageActual> {
  const out = new Map<string, StageActual>();
  for (const e of input.entries) {
    if (!e.task_id) continue;
    const stageId = input.taskToStage.get(e.task_id);
    if (!stageId) continue;
    const stage = input.stageById.get(stageId);
    if (!stage) continue;
    const cur = out.get(stageId) ?? emptyActual();
    cur.loggedHours += e.hours;
    if (!e.billable) cur.nonBillableHours += e.hours;
    const resourceId = stage.allocations[0]?.resource_id;
    if (resourceId) {
      cur.laborCost += e.hours * lockedCostRate(e.cost_rate_snapshot, input.costRateFor(resourceId));
      if (stage.billing_model === "hourly" && e.billable) cur.tmRevenue += e.hours * input.saleRateFor(resourceId);
    }
    out.set(stageId, cur);
  }
  return out;
}

/** Sum stage actuals per project. */
export function projectActualsFromStages(
  byStage: Map<string, StageActual>,
  stageById: Map<string, StageLite>,
): Map<string, StageActual> {
  const out = new Map<string, StageActual>();
  for (const [sid, a] of byStage) {
    const pid = stageById.get(sid)?.project_id;
    if (!pid) continue;
    const cur = out.get(pid) ?? emptyActual();
    cur.laborCost += a.laborCost;
    cur.loggedHours += a.loggedHours;
    cur.nonBillableHours += a.nonBillableHours;
    cur.tmRevenue += a.tmRevenue;
    out.set(pid, cur);
  }
  return out;
}

export type ConsumptionBand = "ok" | "near" | "over";

/** Green < 80 %, amber 80–100 %, red > 100 %. */
export function consumptionBand(pct: number): ConsumptionBand {
  if (pct > 100) return "over";
  if (pct >= 80) return "near";
  return "ok";
}

/** % of the schedule elapsed on `asOf` (0..100), null without valid dates. */
export function scheduleElapsedPct(start: string | null, end: string | null, asOf: string): number | null {
  if (!start || !end || end <= start) return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  const n = Date.parse(asOf);
  return Math.max(0, Math.min(100, ((n - s) / (e - s)) * 100));
}

export interface ConsumptionRow {
  projectId: string;
  budget: number;
  laborCost: number;
  pursuitCost: number;
  otherCost: number;
  cost: number;
  pct: number | null;
}

export function consumptionTotals(rows: ConsumptionRow[]) {
  const budgeted = rows.filter((r) => r.budget > 0);
  const budget = budgeted.reduce((s, r) => s + r.budget, 0);
  const cost = budgeted.reduce((s, r) => s + r.cost, 0);
  const over = budgeted.filter((r) => r.cost > r.budget);
  return {
    budget,
    cost,
    pct: budget > 0 ? (cost / budget) * 100 : null,
    overCount: over.length,
    overAmount: over.reduce((s, r) => s + (r.cost - r.budget), 0),
    nearCount: budgeted.filter((r) => r.pct != null && r.pct >= 80 && r.pct <= 100).length,
  };
}
