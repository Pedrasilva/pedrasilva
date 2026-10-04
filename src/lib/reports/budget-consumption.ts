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

// ---------------------------------------------------------------------------
// PSA-own budget rule
//
// A project stage is a supplier stage when its source quote stage has
// is_self = false (same split as the project page's Services / Suppliers).
// For supplier stages pm_stages.budget is the supplier cost; the sold value is
// cost × (1 + supplier markup %). Only the positive margin counts as budget.
// Purchases / expenses paid to those suppliers (matched by supplier company,
// supplier id or label) are excluded from the actual cost.
// ---------------------------------------------------------------------------

export interface SupplierStageInfo {
  /** Supplier administration markup % (0 = pass-through). */
  markupPct: number;
  /** Identity keys (co:/pm:/lb:) used to match purchases & expenses. */
  supplierKey: string;
}

export interface ExternalLine {
  sold: number;
  cost: number;
  margin: number;
}

export function stageBudgetSplit(
  stage: { id: string; budget: number | string | null },
  supplier: Map<string, SupplierStageInfo>,
): { own: number; external: ExternalLine | null } {
  const b = Number(stage.budget) || 0;
  const info = supplier.get(stage.id);
  if (!info) return { own: b, external: null };
  const sold = b * (1 + (info.markupPct || 0) / 100);
  return { own: Math.max(0, sold - b), external: { sold, cost: b, margin: Math.max(0, sold - b) } };
}

export function addExternal(a: ExternalLine, b: ExternalLine | null): ExternalLine {
  if (!b) return a;
  return { sold: a.sold + b.sold, cost: a.cost + b.cost, margin: a.margin + b.margin };
}

export const emptyExternal = (): ExternalLine => ({ sold: 0, cost: 0, margin: 0 });

/** Purchase/expense row with optional supplier identity. */
export interface CostItem {
  project_id: string | null;
  amount: number;
  supplierKey: string;
}

/**
 * Split project purchases/expenses into PSA-own cost and payments to the
 * project's supplier-stage suppliers (excluded from actual cost).
 */
export function splitOtherCosts(
  items: CostItem[],
  supplierKeysByProject: Map<string, Set<string>>,
): { own: Map<string, number>; external: Map<string, number> } {
  const own = new Map<string, number>();
  const external = new Map<string, number>();
  for (const it of items) {
    if (!it.project_id) continue;
    const keys = supplierKeysByProject.get(it.project_id);
    const target = it.supplierKey && keys?.has(it.supplierKey) ? external : own;
    target.set(it.project_id, (target.get(it.project_id) ?? 0) + it.amount);
  }
  return { own, external };
}
