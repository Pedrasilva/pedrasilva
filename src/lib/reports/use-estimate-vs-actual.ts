import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "./use-hours-logged";

export interface EvaStage {
  id: string;
  project_id: string;
  parent_stage_id: string | null;
  name: string;
  sort_order: number | null;
  status: string | null;
  is_self: boolean | null;
  start_date: string | null;
  end_date: string | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  baseline_budget: number | null;
  baseline_target_hours: number | null;
  billing_model: string | null;
  source_quote_stage_id: string | null;
  quote_stages: { phase_code: string | null; phase_group: string | null } | null;
  pm_allocations: { resource_id: string }[];
}

/** Stages of active/closing/archived projects, their quote phase codes, and all hours by task. */
export function useEstimateVsActualData() {
  return useQuery({
    queryKey: ["report-estimate-vs-actual"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: projects, error: pe } = await supabase
        .from("pm_projects")
        .select("id, name, client, status")
        .in("status", ["active", "closing", "archived"]);
      if (pe) throw pe;
      const ids = (projects ?? []).map((p) => p.id);
      const [stages, entries, tasks] = await Promise.all([
        ids.length
          ? fetchAll<EvaStage>((a, b) =>
              supabase
                .from("pm_stages")
                .select(
                  "id, project_id, parent_stage_id, name, sort_order, status, is_self, start_date, end_date, baseline_start_date, baseline_end_date, baseline_budget, baseline_target_hours, billing_model, source_quote_stage_id, quote_stages:source_quote_stage_id(phase_code, phase_group), pm_allocations(resource_id)",
                )
                .in("project_id", ids)
                .is("archived_at", null)
                .order("id")
                .range(a, b) as never,
            )
          : Promise.resolve([] as EvaStage[]),
        fetchAll<{ task_id: string | null; hours: number; billable: boolean; cost_rate_snapshot: number | null }>((a, b) =>
          supabase
            .from("pm_time_entries")
            .select("task_id, hours, billable, cost_rate_snapshot")
            .not("task_id", "is", null)
            .order("id")
            .range(a, b) as never,
        ),
        fetchAll<{ id: string; pm_allocations: { stage_id: string } | { stage_id: string }[] | null }>((a, b) =>
          supabase.from("pm_tasks").select("id, pm_allocations!inner(stage_id)").order("id").range(a, b) as never,
        ),
      ]);
      const taskToStage = new Map<string, string>();
      for (const t of tasks) {
        const sid = Array.isArray(t.pm_allocations) ? t.pm_allocations[0]?.stage_id : t.pm_allocations?.stage_id;
        if (sid) taskToStage.set(t.id, sid);
      }
      return {
        projects: projects ?? [],
        stages,
        taskToStage,
        entries: entries.map((e) => ({
          ...e,
          hours: Number(e.hours ?? 0),
          cost_rate_snapshot: e.cost_rate_snapshot == null ? null : Number(e.cost_rate_snapshot),
        })),
      };
    },
  });
}
