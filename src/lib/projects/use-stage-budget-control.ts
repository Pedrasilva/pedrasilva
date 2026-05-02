/**
 * Per-stage + project-level budget control numbers.
 *
 * Combines:
 *   • planned hours from pm_allocations (using effective cost rates)
 *   • actual hours/cost from pm_time_entries (live timesheet)
 *   • imported actuals from historical_time_entries (project-level only —
 *     these rows have no allocation/stage link, so they are folded into the
 *     project totals only and never re-distributed across stages).
 *
 * Idempotency: live `pm_time_entries` are never mirrored into
 * `historical_time_entries`, and the importer enforces UNIQUE
 * (source_system, external_id), so summing both sources cannot double-count
 * the same logged hour.
 *
 * Formula (per stage and project):
 *   actual_hours_logged       = Σ logged hours
 *   actual_billable_hours     = Σ billable hours
 *   actual_non_billable_hours = Σ non-billable hours
 *   actual_cost_consumed      = Σ logged hours × resource cost rate (proportional split)
 *   actual_value_generated    = Σ billable hours × resource sale rate (proportional split)
 *   remaining_budget          = original_budget − actual_cost_consumed
 *   planned_future_cost       = future allocation hours × cost rate (entries from today onward)
 *   projected_over_under      = remaining_budget − planned_future_cost
 *   average_team_hourly_rate  = weighted-avg cost rate of resources on the stage/project
 *   estimated_available_hours = remaining_budget / average_team_hourly_rate
 *
 * Moving a stage/task moves only future allocations — actual logged time
 * stays anchored to its real timesheet date by construction (we never derive
 * actuals from allocation date math).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  effectiveCostRate,
  effectiveSaleRate,
  type DefaultRateInfo,
} from "@/lib/projects/use-default-rates";

type DefaultRatesMap = Map<string, DefaultRateInfo> | undefined;
import { allocationHours } from "@/lib/projects/gantt-utils";

export interface StageBudgetControl {
  stage_id: string;
  original_budget: number;
  actual_hours_logged: number;
  actual_billable_hours: number;
  actual_non_billable_hours: number;
  actual_cost_consumed: number;
  actual_value_generated: number;
  remaining_budget: number;
  planned_future_hours: number;
  planned_future_cost: number;
  projected_over_under: number;
  average_team_hourly_rate: number;
  estimated_available_hours: number | null; // null when no team rate available
  has_team_rate: boolean;
}

export interface ProjectBudgetControl extends Omit<StageBudgetControl, "stage_id"> {
  project_id: string;
  imported_logged_hours: number;
  imported_cost: number;
  imported_value: number;
  imported_sources: string[];
}

export interface AllocationActuals {
  allocation_id: string;
  actual_hours_logged: number;
  actual_billable_hours: number;
  actual_cost_consumed: number;
  planned_future_hours: number;
  planned_future_cost: number;
}

interface AllocLite {
  id: string;
  start_date: string;
  end_date: string;
  hours_per_day: number;
  resource_id: string;
  cost_rate: number;
  sale_rate: number;
}

interface StageLite {
  id: string;
  budget: number;
  allocations: AllocLite[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Future hours/cost for an allocation = sum of working-day capacity from
 * max(today, start) to end. Uses the same simple working-day math as the
 * Gantt budget bars; never includes past dates.
 */
function futureHours(a: AllocLite, today: string): number {
  if (a.end_date < today) return 0;
  const start = a.start_date < today ? today : a.start_date;
  return allocationHours({
    start_date: start,
    end_date: a.end_date,
    hours_per_day: Number(a.hours_per_day),
  });
}

function plannedHours(a: AllocLite): number {
  return allocationHours({
    start_date: a.start_date,
    end_date: a.end_date,
    hours_per_day: Number(a.hours_per_day),
  });
}

interface ComputeArgs {
  stages: StageLite[];
  /** task_id -> allocation */
  taskToAlloc: Map<string, AllocLite>;
  /** allocation_id -> stage_id */
  allocToStage: Map<string, string>;
  entries: { task_id: string; hours: number; billable: boolean }[];
  imported: {
    loggedHours: number;
    billableHours: number;
    nonBillableHours: number;
    cost: number;
    amount: number;
    sources: string[];
  };
  project_id: string;
}

function computeControl({
  stages,
  taskToAlloc,
  allocToStage,
  entries,
  imported,
  project_id,
}: ComputeArgs): {
  byStage: Map<string, StageBudgetControl>;
  byAllocation: Map<string, AllocationActuals>;
  project: ProjectBudgetControl;
} {
  const today = todayIso();

  // Per-stage planned hours per allocation (for proportional split of logged
  // hours back onto allocations / cost rates).
  const stagePlanned = new Map<
    string,
    { planned: { allocId: string; h: number; cost: number; sale: number }[]; totPlan: number }
  >();
  for (const s of stages) {
    const planned = s.allocations.map((a) => ({
      allocId: a.id,
      h: plannedHours(a),
      cost: Number(a.cost_rate),
      sale: Number(a.sale_rate),
    }));
    stagePlanned.set(s.id, {
      planned,
      totPlan: planned.reduce((x, y) => x + y.h, 0),
    });
  }

  // Bucket logged entries by stage.
  const stageLogged = new Map<
    string,
    { logged: number; billable: number; nonBillable: number }
  >();
  for (const e of entries) {
    const alloc = taskToAlloc.get(e.task_id);
    if (!alloc) continue;
    const stageId = allocToStage.get(alloc.id);
    if (!stageId) continue;
    const h = Number(e.hours);
    const cur = stageLogged.get(stageId) ?? { logged: 0, billable: 0, nonBillable: 0 };
    cur.logged += h;
    if (e.billable) cur.billable += h;
    else cur.nonBillable += h;
    stageLogged.set(stageId, cur);
  }

  const byStage = new Map<string, StageBudgetControl>();
  const byAllocation = new Map<string, AllocationActuals>();
  let projTotals = {
    budget: 0,
    logged: 0,
    billable: 0,
    nonBillable: 0,
    cost: 0,
    value: 0,
    futureH: 0,
    futureC: 0,
    rateNum: 0,
    rateDen: 0,
  };

  for (const s of stages) {
    const planMeta = stagePlanned.get(s.id)!;
    const log = stageLogged.get(s.id) ?? { logged: 0, billable: 0, nonBillable: 0 };
    let cost = 0;
    let value = 0;
    let plannedFutureH = 0;
    let plannedFutureC = 0;
    let rateNum = 0;
    let rateDen = 0;

    if (planMeta.totPlan > 0) {
      for (const p of planMeta.planned) {
        const w = p.h / planMeta.totPlan;
        cost += w * log.logged * p.cost;
        value += w * log.billable * p.sale;
      }
    }
    for (const a of s.allocations) {
      const fh = futureHours(a, today);
      plannedFutureH += fh;
      plannedFutureC += fh * Number(a.cost_rate);
      const ph = plannedHours(a);
      rateNum += ph * Number(a.cost_rate);
      rateDen += ph;

      // Per-allocation actuals (proportional split of stage logged hours).
      const w =
        planMeta.totPlan > 0 ? ph / planMeta.totPlan : 0;
      const aLogged = w * log.logged;
      const aBillable = w * log.billable;
      byAllocation.set(a.id, {
        allocation_id: a.id,
        actual_hours_logged: aLogged,
        actual_billable_hours: aBillable,
        actual_cost_consumed: aLogged * Number(a.cost_rate),
        planned_future_hours: fh,
        planned_future_cost: fh * Number(a.cost_rate),
      });
    }

    const budget = Number(s.budget);
    const remaining = budget - cost;
    const avgRate = rateDen > 0 ? rateNum / rateDen : 0;
    const hasTeamRate = avgRate > 0;

    byStage.set(s.id, {
      stage_id: s.id,
      original_budget: budget,
      actual_hours_logged: log.logged,
      actual_billable_hours: log.billable,
      actual_non_billable_hours: log.nonBillable,
      actual_cost_consumed: cost,
      actual_value_generated: value,
      remaining_budget: remaining,
      planned_future_hours: plannedFutureH,
      planned_future_cost: plannedFutureC,
      projected_over_under: remaining - plannedFutureC,
      average_team_hourly_rate: avgRate,
      estimated_available_hours: hasTeamRate ? remaining / avgRate : null,
      has_team_rate: hasTeamRate,
    });

    projTotals.budget += budget;
    projTotals.logged += log.logged;
    projTotals.billable += log.billable;
    projTotals.nonBillable += log.nonBillable;
    projTotals.cost += cost;
    projTotals.value += value;
    projTotals.futureH += plannedFutureH;
    projTotals.futureC += plannedFutureC;
    projTotals.rateNum += rateNum;
    projTotals.rateDen += rateDen;
  }

  // Fold imported historical totals into PROJECT level only (no stage link).
  const totalLogged = projTotals.logged + imported.loggedHours;
  const totalBillable = projTotals.billable + imported.billableHours;
  const totalNonBillable = projTotals.nonBillable + imported.nonBillableHours;
  const totalCost = projTotals.cost + imported.cost;
  const totalValue = projTotals.value + imported.amount;
  const projAvgRate = projTotals.rateDen > 0 ? projTotals.rateNum / projTotals.rateDen : 0;
  const projRemaining = projTotals.budget - totalCost;
  const projHasRate = projAvgRate > 0;

  const project: ProjectBudgetControl = {
    project_id,
    original_budget: projTotals.budget,
    actual_hours_logged: totalLogged,
    actual_billable_hours: totalBillable,
    actual_non_billable_hours: totalNonBillable,
    actual_cost_consumed: totalCost,
    actual_value_generated: totalValue,
    remaining_budget: projRemaining,
    planned_future_hours: projTotals.futureH,
    planned_future_cost: projTotals.futureC,
    projected_over_under: projRemaining - projTotals.futureC,
    average_team_hourly_rate: projAvgRate,
    estimated_available_hours: projHasRate ? projRemaining / projAvgRate : null,
    has_team_rate: projHasRate,
    imported_logged_hours: imported.loggedHours,
    imported_cost: imported.cost,
    imported_value: imported.amount,
    imported_sources: imported.sources,
  };

  return { byStage, byAllocation, project };
}

export interface UseStageBudgetControlArgs {
  projectId: string;
  defaultRates: DefaultRatesMap;
}

export function useStageBudgetControl({ projectId, defaultRates }: UseStageBudgetControlArgs) {
  return useQuery({
    queryKey: ["stage-budget-control", projectId, defaultRates ? defaultRates.size : 0],
    enabled: !!projectId,
    queryFn: async () => {
      const [{ data: stagesRaw, error: sErr }, { data: histRaw }] = await Promise.all([
        supabase
          .from("pm_stages")
          .select(
            "id, budget, allocations:pm_allocations(id, start_date, end_date, hours_per_day, resource:pm_resources(id, hourly_rate, cost_rate))",
          )
          .eq("project_id", projectId),
        supabase
          .from("historical_time_entries")
          .select("source_system, billable_hours, non_billable_hours, cost, amount")
          .eq("project_id", projectId),
      ]);
      if (sErr) throw sErr;

      type RawAlloc = {
        id: string;
        start_date: string;
        end_date: string;
        hours_per_day: number | string;
        resource: { id: string; hourly_rate: number | string; cost_rate: number | string };
      };
      type RawStage = { id: string; budget: number | string; allocations: RawAlloc[] };

      const stages: StageLite[] = ((stagesRaw ?? []) as RawStage[]).map((s) => ({
        id: s.id,
        budget: Number(s.budget),
        allocations: (s.allocations ?? []).map((a) => ({
          id: a.id,
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day),
          resource_id: a.resource.id,
          cost_rate: effectiveCostRate(
            Number(a.resource.cost_rate),
            a.resource.id,
            defaultRates,
          ),
          sale_rate: effectiveSaleRate(
            Number(a.resource.hourly_rate),
            a.resource.id,
            defaultRates,
          ),
        })),
      }));

      const allocToStage = new Map<string, string>();
      const allocIds: string[] = [];
      for (const s of stages) {
        for (const a of s.allocations) {
          allocToStage.set(a.id, s.id);
          allocIds.push(a.id);
        }
      }

      const taskToAlloc = new Map<string, AllocLite>();
      let entries: { task_id: string; hours: number; billable: boolean }[] = [];
      if (allocIds.length > 0) {
        const { data: tasks } = await supabase
          .from("pm_tasks")
          .select("id, allocation_id")
          .in("allocation_id", allocIds);
        const allocById = new Map<string, AllocLite>();
        for (const s of stages) for (const a of s.allocations) allocById.set(a.id, a);
        for (const t of (tasks ?? []) as { id: string; allocation_id: string }[]) {
          const a = allocById.get(t.allocation_id);
          if (a) taskToAlloc.set(t.id, a);
        }
        const taskIds = Array.from(taskToAlloc.keys());
        if (taskIds.length > 0) {
          const { data: ents } = await supabase
            .from("pm_time_entries")
            .select("task_id, hours, billable")
            .eq("entry_type", "project")
            .in("task_id", taskIds);
          entries = ((ents ?? []) as Array<{ task_id: string; hours: number; billable: boolean }>).map((e) => ({
            task_id: e.task_id,
            hours: Number(e.hours),
            billable: !!e.billable,
          }));
        }
      }

      const sources = new Set<string>();
      let impB = 0;
      let impN = 0;
      let impC = 0;
      let impA = 0;
      for (const r of (histRaw ?? []) as Array<{
        source_system: string;
        billable_hours: number | string | null;
        non_billable_hours: number | string | null;
        cost: number | string | null;
        amount: number | string | null;
      }>) {
        sources.add(r.source_system);
        impB += Number(r.billable_hours ?? 0);
        impN += Number(r.non_billable_hours ?? 0);
        impC += Number(r.cost ?? 0);
        impA += Number(r.amount ?? 0);
      }

      return computeControl({
        stages,
        taskToAlloc,
        allocToStage,
        entries,
        imported: {
          loggedHours: impB + impN,
          billableHours: impB,
          nonBillableHours: impN,
          cost: impC,
          amount: impA,
          sources: Array.from(sources),
        },
        project_id: projectId,
      });
    },
  });
}
