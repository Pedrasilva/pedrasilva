import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { expandNonWorkingForRange, type CollaboratorMapRow } from "@/lib/projects/non-working-sync";
import { buildStageNumberMap, formatStageLabel } from "@/lib/quotes/stage-numbering";
import { fetchAll, loadRoster } from "./use-hours-logged";
import type { CfAllocation, CfPlaceholder, CfStage } from "./capacity-forecast";
import { todayISO } from "./capacity-forecast";

type StageRow = {
  id: string; project_id: string; name: string; status: string | null; is_self: boolean | null;
  budget: number | null; start_date: string | null; end_date: string | null; parent_stage_id: string | null; sort_order: number | null; archived_at: string | null;
};

/** Inputs for the capacity forecast over [start, end] (future dates). */
export function useCapacityForecastData(start: string, end: string) {
  return useQuery({
    queryKey: ["report-capacity-forecast", start, end],
    enabled: !!start && !!end,
    queryFn: async () => {
      const roster = await loadRoster();
      const userMap = new Map<string, CollaboratorMapRow>(
        roster.map((p) => [p.collaboratorId, { collaborator_id: p.collaboratorId, user_id: p.userId, daily_hours: Number(p.dailyHours) || 8 }]),
      );
      const [nonWorking, allocations, stageRows, projects, placeholders, holRes] = await Promise.all([
        expandNonWorkingForRange({ rangeStart: start, rangeEnd: end, userMap }),
        fetchAll<CfAllocation>((a, b) =>
          supabase.from("pm_allocations")
            .select("id, resource_id, stage_id, start_date, end_date, hours_per_day, allocation_percentage")
            .order("id").range(a, b) as never,
        ),
        fetchAll<StageRow>((a, b) =>
          supabase.from("pm_stages")
            .select("id, project_id, name, status, is_self, budget, start_date, end_date, parent_stage_id, sort_order, archived_at")
            .order("id").range(a, b) as never,
        ),
        fetchAll<{ id: string; name: string }>((a, b) =>
          supabase.from("pm_projects").select("id, name").order("id").range(a, b) as never,
        ),
        fetchAll<CfPlaceholder>((a, b) =>
          supabase.from("pm_stage_allocation_placeholders").select("project_stage_id, expected_hours").order("id").range(a, b) as never,
        ),
        supabase.from("holidays").select("data").gte("data", start < todayISO() ? start : todayISO()),
      ]);
      if (holRes.error) throw holRes.error;
      const projById = new Map(projects.map((p) => [p.id, p]));
      const byProject = new Map<string, StageRow[]>();
      for (const s of stageRows) byProject.set(s.project_id, [...(byProject.get(s.project_id) ?? []), s]);
      const stages = new Map<string, CfStage>();
      for (const [pid, list] of byProject) {
        const nums = buildStageNumberMap(list as never);
        const p = projById.get(pid);
        const projectLabel = p?.name ?? "—";
        for (const s of list) {
          // Own work only, on stages still to be delivered.
          if (s.archived_at || s.is_self === false) continue;
          if (s.status !== "active" && s.status !== "planned") continue;
          stages.set(s.id, {
            id: s.id, project_id: pid, projectLabel,
            label: formatStageLabel(s as never, nums.get(s.id)),
            start_date: s.start_date, end_date: s.end_date,
            budget: s.budget == null ? null : Number(s.budget),
          });
        }
      }
      // All hours logged so far on the included stages (any person) — for the remaining-hours estimate.
      const allocStage = new Map((allocations as (CfAllocation & { id: string })[]).filter((a) => stages.has(a.stage_id)).map((a) => [a.id, a.stage_id]));
      const tasks = await fetchAll<{ id: string; allocation_id: string }>((a, b) =>
        supabase.from("pm_tasks").select("id, allocation_id").order("id").range(a, b) as never,
      );
      const taskStage = new Map<string, string>();
      for (const t of tasks) { const sid = allocStage.get(t.allocation_id); if (sid) taskStage.set(t.id, sid); }
      const entries = await fetchAll<{ task_id: string; hours: number }>((a, b) =>
        supabase.from("pm_time_entries").select("task_id, hours").not("task_id", "is", null).order("id").range(a, b) as never,
      );
      const loggedByStage = new Map<string, number>();
      for (const e of entries) { const sid = taskStage.get(e.task_id); if (sid) loggedByStage.set(sid, (loggedByStage.get(sid) ?? 0) + Number(e.hours ?? 0)); }
      return {
        loggedByStage,
        roster,
        nonWorking,
        allocations: allocations.map((a) => ({ ...a, hours_per_day: a.hours_per_day == null ? null : Number(a.hours_per_day), allocation_percentage: a.allocation_percentage == null ? null : Number(a.allocation_percentage) })),
        stages,
        placeholders,
        holidays: (holRes.data ?? []).map((h) => h.data as string),
      };
    },
  });
}
