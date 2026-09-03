/**
 * Task names for stage allocations. A task in the Projects module is stored as
 * pm_tasks (1:1 with pm_allocations), so creating a task means creating the
 * allocation (who + how long) and naming its task row.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** allocation_id → task name, for every allocation of a project. */
export function useAllocationTaskNames(allocationIds: string[]) {
  const key = [...allocationIds].sort().join(",");
  return useQuery({
    queryKey: ["pm-allocation-task-names", key],
    enabled: allocationIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("pm_tasks")
        .select("allocation_id, name")
        .in("allocation_id", allocationIds);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const t of (data ?? []) as Array<{ allocation_id: string; name: string }>) {
        out[t.allocation_id] = t.name;
      }
      return out;
    },
  });
}

/**
 * Creates a task inside a stage: allocates the chosen resource for the given
 * span and renames the auto-created task row.
 */
export function useCreateStageTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      stage_id: string;
      resource_id: string;
      name: string;
      start_date: string;
      end_date: string;
      hours_per_day: number;
    }) => {
      const { data: alloc, error } = await supabase
        .from("pm_allocations")
        .insert({
          stage_id: input.stage_id,
          resource_id: input.resource_id,
          start_date: input.start_date,
          end_date: input.end_date,
          hours_per_day: input.hours_per_day,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: taskError } = await supabase
        .from("pm_tasks")
        .update({ name: input.name })
        .eq("allocation_id", (alloc as { id: string }).id);
      if (taskError) throw taskError;
      return alloc as { id: string };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-allocation-task-names"] });
      qc.invalidateQueries({ queryKey: ["pm-my-tasks"] });
      qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
    },
  });
}
