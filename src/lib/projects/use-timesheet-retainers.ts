/**
 * Retainer (monthly) projects for the timesheet grid. One row per retainer
 * parent stage; each day's hours go to the monthly child stage of that day's
 * month through the normal task path (useEnsureStageRow + useUpsertTimesheetCell),
 * so rates, approvals and locked weeks behave exactly like any project row.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RetainerChild = { id: string; start_date: string; end_date: string; month: string };
export type RetainerParentRow = {
  id: string;
  name: string;
  project: { id: string; name: string; client: string | null; color: string };
  children: RetainerChild[];
};

export function useTimesheetRetainers(resourceId: string | null) {
  return useQuery({
    queryKey: ["pm-timesheet-retainers", resourceId],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data: parents, error } = await supabase
        .from("pm_stages")
        .select("id, name, project:pm_projects(id, name, client, color)")
        .eq("stage_kind", "retainer_monthly");
      if (error) throw error;
      const ps = (parents ?? []) as unknown as Array<{ id: string; name: string; project: RetainerParentRow["project"] | null }>;
      const parentIds = ps.map((p) => p.id);
      const { data: kids } = parentIds.length
        ? await supabase.from("pm_stages").select("id, parent_stage_id, start_date, end_date").in("parent_stage_id", parentIds)
        : { data: [] };
      const byParent = new Map<string, RetainerChild[]>();
      const childToParent = new Map<string, string>();
      for (const k of (kids ?? []) as Array<{ id: string; parent_stage_id: string; start_date: string; end_date: string }>) {
        if (!k.start_date) continue;
        byParent.set(k.parent_stage_id, [
          ...(byParent.get(k.parent_stage_id) ?? []),
          { id: k.id, start_date: k.start_date, end_date: k.end_date, month: k.start_date.slice(0, 7) },
        ]);
        childToParent.set(k.id, k.parent_stage_id);
      }
      const rows: RetainerParentRow[] = ps
        .filter((p) => p.project)
        .map((p) => ({ id: p.id, name: p.name, project: p.project!, children: byParent.get(p.id) ?? [] }));

      // This person's tasks on retainer months → which month stage they belong to.
      const taskToChild = new Map<string, string>();
      const childIds = [...childToParent.keys()];
      if (resourceId && childIds.length) {
        const { data: tasks } = await supabase
          .from("pm_tasks")
          .select("id, allocation:pm_allocations!inner(stage_id, resource_id)")
          .eq("allocation.resource_id", resourceId)
          .in("allocation.stage_id", childIds);
        for (const t of (tasks ?? []) as unknown as Array<{ id: string; allocation: { stage_id: string } }>)
          taskToChild.set(t.id, t.allocation.stage_id);
      }
      return { rows, childToParent, taskToChild };
    },
  });
}
