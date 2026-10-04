import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll, loadRoster } from "./use-hours-logged";

/** Project hours up to `upTo`, task → stage map, materials/expenses, project teams and roster. */
export function useBudgetConsumptionData(upTo: string) {
  return useQuery({
    queryKey: ["report-budget-consumption", upTo],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [entries, tasks, mats, exps, team, roster] = await Promise.all([
        fetchAll<{ task_id: string | null; hours: number; billable: boolean; cost_rate_snapshot: number | null }>((a, b) =>
          supabase
            .from("pm_time_entries")
            .select("task_id, hours, billable, cost_rate_snapshot")
            .eq("entry_type", "project")
            .lte("entry_date", upTo)
            .order("id")
            .range(a, b) as never,
        ),
        fetchAll<{ id: string; pm_allocations: { stage_id: string } | { stage_id: string }[] | null }>((a, b) =>
          supabase.from("pm_tasks").select("id, pm_allocations!inner(stage_id)").order("id").range(a, b) as never,
        ),
        fetchAll<{ project_id: string | null; purchase_price: number | null; quantity: number | null }>((a, b) =>
          supabase.from("pm_materials").select("project_id, purchase_price, quantity").order("id").range(a, b) as never,
        ),
        fetchAll<{ project_id: string | null; purchase_price: number | null }>((a, b) =>
          supabase.from("pm_expenses").select("project_id, purchase_price").order("id").range(a, b) as never,
        ),
        fetchAll<{ project_id: string; resource_id: string }>((a, b) =>
          supabase.from("pm_project_team").select("project_id, resource_id").order("id").range(a, b) as never,
        ),
        loadRoster(),
      ]);
      const taskToStage = new Map<string, string>();
      for (const t of tasks) {
        const sid = Array.isArray(t.pm_allocations) ? t.pm_allocations[0]?.stage_id : t.pm_allocations?.stage_id;
        if (sid) taskToStage.set(t.id, sid);
      }
      const otherCost = new Map<string, number>();
      for (const m of mats) {
        if (!m.project_id) continue;
        const q = m.quantity == null ? 1 : Number(m.quantity);
        otherCost.set(m.project_id, (otherCost.get(m.project_id) ?? 0) + Number(m.purchase_price ?? 0) * q);
      }
      for (const x of exps) {
        if (!x.project_id) continue;
        otherCost.set(x.project_id, (otherCost.get(x.project_id) ?? 0) + Number(x.purchase_price ?? 0));
      }
      const teamByProject = new Map<string, string[]>();
      for (const t of team) teamByProject.set(t.project_id, [...(teamByProject.get(t.project_id) ?? []), t.resource_id]);
      return {
        entries: entries.map((e) => ({
          ...e,
          hours: Number(e.hours ?? 0),
          cost_rate_snapshot: e.cost_rate_snapshot == null ? null : Number(e.cost_rate_snapshot),
        })),
        taskToStage,
        otherCost,
        teamByProject,
        roster,
      };
    },
  });
}
