import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, startOfMonth } from "date-fns";
import { probabilityFromProposal } from "@/lib/projects/use-project-probabilities";
import {
  rollupExternalServices,
  rollupExpenses,
  sumFinancialsRows,
  type FinancialsRow,
} from "@/lib/projects/financial-rollups";
import type { Database } from "@/integrations/supabase/types";

export interface MonthlyPoint {
  month: string;
  monthKey: string;
  hours: number;
  activities: number;
}

export interface ResourceWorkRow {
  resource_id: string;
  name: string;
  color: string;
  initial: string;
  hours: number;
  billableHours: number;
  nonBillableHours: number;
  cost: number;
  sale: number;
}

export type { FinancialsRow };

export interface ProjectInsights {
  monthly: MonthlyPoint[];
  byResource: ResourceWorkRow[];
  totals: {
    plannedHours: number;
    loggedHours: number;
    billableHours: number;
    nonBillableHours: number;
    earnedValue: number;
    forecastValue: number;
    budgetTotal: number;
    earnedPct: number;
    forecastPct: number;
    profitPctCurrent: number;
    profitPctForecast: number;
    profitMarginPct: number;
  };
  financials: {
    services: FinancialsRow;
    materials: FinancialsRow;
    expenses: FinancialsRow;
    total: FinancialsRow;
  };
  workInProgressHours: number;
  workDonePct: number;
  imported: {
    sources: string[];
    loggedHours: number;
    cost: number;
    amount: number;
  };
}

export function useProjectInsights(projectId: string) {
  return useQuery({
    queryKey: ["pm-project-insights", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectInsights> => {
      const { data: stages, error: sErr } = await supabase
        .from("pm_stages")
        .select(
          "id, budget, allocations:pm_allocations(id, hours_per_day, start_date, end_date, resource:pm_resources(id, name, color, hourly_rate, cost_rate), tasks:pm_tasks(id))",
        )
        .eq("project_id", projectId);
      if (sErr) throw sErr;

      const allTaskIds: string[] = [];
      type AllocLite = {
        id: string;
        hours_per_day: number;
        start_date: string;
        end_date: string;
        resource: {
          id: string;
          name: string;
          color: string;
          hourly_rate: number;
          cost_rate: number;
        };
        tasks: { id: string }[];
      };
      const taskToAlloc = new Map<string, AllocLite>();
      const resourceTotals = new Map<string, ResourceWorkRow>();
      let budgetTotal = 0;
      let plannedHours = 0;

      for (const s of (stages ?? []) as unknown as Array<{
        budget: number;
        allocations: AllocLite[];
      }>) {
        budgetTotal += Number(s.budget);
        for (const a of s.allocations) {
          for (const t of a.tasks ?? []) {
            allTaskIds.push(t.id);
            taskToAlloc.set(t.id, a);
          }
          const wd = workingDaysBetween(a.start_date, a.end_date);
          plannedHours += wd * Number(a.hours_per_day);
          const r = a.resource;
          if (!resourceTotals.has(r.id)) {
            resourceTotals.set(r.id, {
              resource_id: r.id,
              name: r.name,
              color: r.color,
              initial: (r.name?.[0] ?? "?").toUpperCase(),
              hours: 0,
              billableHours: 0,
              nonBillableHours: 0,
              cost: 0,
              sale: 0,
            });
          }
        }
      }

      let entries: { task_id: string; entry_date: string; hours: number; billable: boolean }[] = [];
      if (allTaskIds.length > 0) {
        const { data: tData, error: tErr } = await supabase
          .from("pm_time_entries")
          .select("task_id, entry_date, hours, billable")
          .eq("entry_type", "project")
          .in("task_id", allTaskIds);
        if (tErr) throw tErr;
        entries = (tData ?? []) as typeof entries;
      }

      const monthMap = new Map<string, MonthlyPoint>();
      let loggedHours = 0;
      let billableHoursTotal = 0;
      let nonBillableHoursTotal = 0;
      let earnedValue = 0; // revenue from billable hours only
      let servicesCost = 0; // cost from ALL hours logged to project
      for (const e of entries) {
        const alloc = taskToAlloc.get(e.task_id);
        if (!alloc) continue;
        const hours = Number(e.hours);
        const isBillable = !!e.billable;
        loggedHours += hours;

        const rate = Number(alloc.resource.hourly_rate);
        const costRate = Number(alloc.resource.cost_rate);
        const sale = isBillable ? hours * rate : 0;
        const cost = hours * costRate;
        if (isBillable) {
          billableHoursTotal += hours;
          earnedValue += sale;
        } else {
          nonBillableHoursTotal += hours;
        }
        servicesCost += cost;

        const row = resourceTotals.get(alloc.resource.id);
        if (row) {
          row.hours += hours;
          if (isBillable) row.billableHours += hours;
          else row.nonBillableHours += hours;
          row.sale += sale;
          row.cost += cost;
        }

        const d = startOfMonth(parseISO(e.entry_date));
        const key = format(d, "yyyy-MM");
        const label = format(d, "MMM yyyy");
        const cur = monthMap.get(key) ?? { month: label, monthKey: key, hours: 0, activities: 0 };
        cur.hours += hours;
        cur.activities += 1;
        monthMap.set(key, cur);
      }

      const monthly = Array.from(monthMap.values()).sort((a, b) =>
        a.monthKey < b.monthKey ? -1 : 1,
      );

      const [{ data: mats }, { data: exps }, { data: histRows }] = await Promise.all([
        supabase
          .from("pm_materials")
          .select("purchase_price, sale_price, quantity")
          .eq("project_id", projectId),
        supabase
          .from("pm_expenses")
          .select("purchase_price")
          .eq("project_id", projectId),
        supabase
          .from("historical_time_entries")
          .select("source_system, billable_hours, non_billable_hours, cost, amount")
          .eq("project_id", projectId),
      ]);

      // Fold imported historical time entries into project actuals. Live
      // pm_time_entries are never mirrored here, so this cannot double-count
      // the same logged hour. Idempotency on (source_system, external_id)
      // prevents duplicate imports of the same source row.
      let histBillable = 0;
      let histNonBillable = 0;
      let histCost = 0;
      let histAmount = 0;
      const histSources = new Set<string>();
      for (const r of (histRows ?? []) as Array<{
        source_system: string;
        billable_hours: number | string | null;
        non_billable_hours: number | string | null;
        cost: number | string | null;
        amount: number | string | null;
      }>) {
        histSources.add(r.source_system);
        histBillable += Number(r.billable_hours ?? 0);
        histNonBillable += Number(r.non_billable_hours ?? 0);
        histCost += Number(r.cost ?? 0);
        histAmount += Number(r.amount ?? 0);
      }
      loggedHours += histBillable + histNonBillable;
      billableHoursTotal += histBillable;
      nonBillableHoursTotal += histNonBillable;
      earnedValue += histAmount;
      servicesCost += histCost;

      const services: FinancialsRow = {
        budget: budgetTotal,
        value: earnedValue,
        cost: servicesCost,
        profit: earnedValue - servicesCost,
        invoiced: 0,
      };
      const materials = rollupExternalServices(mats ?? []);
      const expensesRow = rollupExpenses(exps ?? []);
      const total = sumFinancialsRows(services, materials, expensesRow);

      const earnedPct = budgetTotal > 0 ? Math.round((earnedValue / budgetTotal) * 100) : 0;
      const remainingPlannedHours = Math.max(0, plannedHours - loggedHours);
      const avgRate =
        resourceTotals.size > 0
          ? Array.from(resourceTotals.values()).reduce(
              (a, r) => a + (r.billableHours > 0 ? r.sale / r.billableHours : 0),
              0,
            ) / resourceTotals.size
          : 0;

      // Probability weighting: if this project was created from a CRM
      // opportunity, scale the *remaining* (not-yet-earned) forecast by the
      // proposal's probability. Already-logged value (earnedValue) stays at
      // 100% — that work has happened. The most-optimistic linked proposal
      // wins, mirroring the rules in useProjectProbabilities.
      const { data: proposals } = await supabase
        .from("fee_proposals")
        .select("probabilidade, pipeline_status")
        .eq("pm_project_id", projectId);
      let weight = 1;
      let hasOpenProposal = false;
      for (const p of (proposals ?? []) as Array<{
        probabilidade: number;
        pipeline_status: Database["public"]["Enums"]["proposal_status"];
      }>) {
        const prob = probabilityFromProposal(p.pipeline_status, Number(p.probabilidade));
        if (prob.isPipeline) hasOpenProposal = true;
        if ((proposals?.length ?? 0) === 1 || prob.weight > weight) weight = prob.weight;
      }
      // If no proposal exists at all, weight stays at 1 (committed work).
      const weightedRemainingValue = remainingPlannedHours * avgRate * weight;
      const forecastValue = earnedValue + weightedRemainingValue;
      const forecastPct = budgetTotal > 0 ? Math.round((forecastValue / budgetTotal) * 100) : 0;
      void hasOpenProposal; // reserved for future UI hint

      const profitPctCurrent = total.value > 0 ? Math.round((total.profit / total.value) * 100) : 0;
      const profitPctForecast =
        forecastValue > 0 ? Math.round(((forecastValue - total.cost) / forecastValue) * 100) : 0;
      // Profit margin = profit / revenue (project revenue from billable hours + materials + expenses value)
      const profitMarginPct =
        total.value > 0 ? Math.round((total.profit / total.value) * 100) : 0;

      const workDonePct =
        plannedHours > 0 ? Math.min(100, Math.round((loggedHours / plannedHours) * 100)) : 0;

      return {
        monthly,
        byResource: Array.from(resourceTotals.values()).sort((a, b) => b.hours - a.hours),
        totals: {
          plannedHours,
          loggedHours,
          billableHours: billableHoursTotal,
          nonBillableHours: nonBillableHoursTotal,
          earnedValue,
          forecastValue,
          budgetTotal,
          earnedPct,
          forecastPct,
          profitPctCurrent,
          profitPctForecast,
          profitMarginPct,
        },
        financials: { services, materials, expenses: expensesRow, total },
        workInProgressHours: Math.max(0, plannedHours - loggedHours),
        workDonePct,
        imported: {
          sources: Array.from(histSources),
          loggedHours: histBillable + histNonBillable,
          cost: histCost,
          amount: histAmount,
        },
      };
    },
  });
}

function workingDaysBetween(start: string, end: string): number {
  const s = parseISO(start);
  const e = parseISO(end);
  let count = 0;
  const d = new Date(s);
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(0, count);
}
