import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll, loadRoster } from "./use-hours-logged";
import type { BPEntry } from "./business-performance";

/** Worked entries in [start, end] (paged), plus the task → stage map and roster. */
export function useBusinessPerformanceData(start: string, end: string) {
  return useQuery({
    queryKey: ["report-business-performance", start, end],
    enabled: !!start && !!end && start <= end,
    queryFn: async () => {
      const [entries, tasks, roster] = await Promise.all([
        fetchAll<BPEntry>((a, b) =>
          supabase
            .from("pm_time_entries")
            .select("user_id, task_id, entry_date, hours, billable, entry_type, cost_rate_snapshot")
            .gte("entry_date", start)
            .lte("entry_date", end)
            .order("id")
            .range(a, b) as never,
        ),
        fetchAll<{ id: string; pm_allocations: { stage_id: string } | { stage_id: string }[] | null }>((a, b) =>
          supabase.from("pm_tasks").select("id, pm_allocations!inner(stage_id)").order("id").range(a, b) as never,
        ),
        loadRoster(),
      ]);
      const taskToStage = new Map<string, string>();
      for (const t of tasks) {
        const sid = Array.isArray(t.pm_allocations) ? t.pm_allocations[0]?.stage_id : t.pm_allocations?.stage_id;
        if (sid) taskToStage.set(t.id, sid);
      }
      return {
        entries: entries.map((e) => ({
          ...e,
          hours: Number(e.hours ?? 0),
          cost_rate_snapshot: e.cost_rate_snapshot == null ? null : Number(e.cost_rate_snapshot),
        })),
        taskToStage,
        roster,
      };
    },
  });
}
