/**
 * Task names for stage allocations. A task in the Projects module is stored as
 * pm_tasks (1:1 with pm_allocations), so creating a task means creating the
 * allocation (who + how long) and naming its task row.
 *
 * Editing a task updates the SAME allocation + task rows — it never inserts a
 * second one, so stage rollups (which are all derived) simply reflect the new
 * numbers with no double-counting.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StageTaskStatus = "pending" | "active" | "paused" | "done";

export interface StageTaskRow {
  id: string;
  allocation_id: string;
  name: string;
  notes: string | null;
  status: StageTaskStatus;
}

/** allocation_id → task row, for every allocation of a project. */
export function useAllocationTasks(allocationIds: string[]) {
  const key = [...allocationIds].sort().join(",");
  return useQuery({
    queryKey: ["pm-allocation-tasks", key],
    enabled: allocationIds.length > 0,
    queryFn: async (): Promise<Record<string, StageTaskRow>> => {
      const { data, error } = await supabase
        .from("pm_tasks")
        .select("id, allocation_id, name, notes, status")
        .in("allocation_id", allocationIds);
      if (error) throw error;
      const out: Record<string, StageTaskRow> = {};
      for (const t of (data ?? []) as StageTaskRow[]) out[t.allocation_id] = t;
      return out;
    },
  });
}

/** allocation_id → task name, for every allocation of a project. */
export function useAllocationTaskNames(allocationIds: string[]) {
  const tasks = useAllocationTasks(allocationIds);
  const data = tasks.data
    ? Object.fromEntries(Object.entries(tasks.data).map(([k, v]) => [k, v.name]))
    : undefined;
  return { ...tasks, data } as typeof tasks & { data: Record<string, string> | undefined };
}

function invalidate(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: ["pm-project", projectId] });
  qc.invalidateQueries({ queryKey: ["pm-allocation-tasks"] });
  qc.invalidateQueries({ queryKey: ["pm-my-tasks"] });
  qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
  qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
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
      status?: StageTaskStatus;
      notes?: string | null;
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
        .update({
          name: input.name,
          notes: input.notes ?? null,
          ...(input.status ? { status: input.status } : {}),
        })
        .eq("allocation_id", (alloc as { id: string }).id);
      if (taskError) throw taskError;
      return alloc as { id: string };
    },
    onSuccess: (_d, vars) => invalidate(qc, vars.projectId),
  });
}

/**
 * Updates an existing task in place: the allocation (who / when / how much)
 * and its task row (name, notes, status). Same rows, no duplicates.
 */
export function useUpdateStageTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      allocation_id: string;
      resource_id: string;
      name: string;
      start_date: string;
      end_date: string;
      hours_per_day: number;
      status?: StageTaskStatus;
      notes?: string | null;
    }) => {
      const { error } = await supabase
        .from("pm_allocations")
        .update({
          resource_id: input.resource_id,
          start_date: input.start_date,
          end_date: input.end_date,
          hours_per_day: input.hours_per_day,
        })
        .eq("id", input.allocation_id);
      if (error) throw error;

      const { error: taskError } = await supabase
        .from("pm_tasks")
        .update({
          name: input.name,
          notes: input.notes ?? null,
          ...(input.status ? { status: input.status } : {}),
        })
        .eq("allocation_id", input.allocation_id);
      if (taskError) throw taskError;
    },
    onSuccess: (_d, vars) => invalidate(qc, vars.projectId),
  });
}
