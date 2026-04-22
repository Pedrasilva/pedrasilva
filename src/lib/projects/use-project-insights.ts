import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, startOfMonth } from "date-fns";

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

export interface FinancialsRow {
  budget: number;
  value: number;
  cost: number;
  profit: number;
  invoiced: number;
}

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

      const [{ data: mats }, { data: exps }] = await Promise.all([
        supabase
          .from("pm_materials")
          .select("purchase_price, sale_price, quantity")
          .eq("project_id", projectId),
        supabase
          .from("pm_expenses")
          .select("purchase_price, sale_price")
          .eq("project_id", projectId),
      ]);

      const materialsBudget = (mats ?? []).reduce(
        (a, m) => a + Number(m.sale_price) * Number(m.quantity),
        0,
      );
      const materialsCost = (mats ?? []).reduce(
        (a, m) => a + Number(m.purchase_price) * Number(m.quantity),
        0,
      );
      const materialsValue = materialsBudget;

      const expensesValue = (exps ?? []).reduce((a, e) => a + Number(e.sale_price), 0);
      const expensesCost = (exps ?? []).reduce((a, e) => a + Number(e.purchase_price), 0);

      const services: FinancialsRow = {
        budget: budgetTotal,
        value: earnedValue,
        cost: servicesCost,
        profit: earnedValue - servicesCost,
        invoiced: 0,
      };
      const materials: FinancialsRow = {
        budget: materialsBudget,
        value: materialsValue,
        cost: materialsCost,
        profit: materialsValue - materialsCost,
        invoiced: 0,
      };
      const expensesRow: FinancialsRow = {
        budget: 0,
        value: expensesValue,
        cost: expensesCost,
        profit: expensesValue - expensesCost,
        invoiced: 0,
      };
      const total: FinancialsRow = {
        budget: services.budget + materials.budget + expensesRow.budget,
        value: services.value + materials.value + expensesRow.value,
        cost: services.cost + materials.cost + expensesRow.cost,
        profit: services.profit + materials.profit + expensesRow.profit,
        invoiced: 0,
      };

      const earnedPct = budgetTotal > 0 ? Math.round((earnedValue / budgetTotal) * 100) : 0;
      const remainingPlannedHours = Math.max(0, plannedHours - loggedHours);
      const avgRate =
        resourceTotals.size > 0
          ? Array.from(resourceTotals.values()).reduce(
              (a, r) => a + (r.billableHours > 0 ? r.sale / r.billableHours : 0),
              0,
            ) / resourceTotals.size
          : 0;
      const forecastValue = earnedValue + remainingPlannedHours * avgRate;
      const forecastPct = budgetTotal > 0 ? Math.round((forecastValue / budgetTotal) * 100) : 0;

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
