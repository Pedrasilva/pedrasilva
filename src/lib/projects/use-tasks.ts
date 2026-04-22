import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TaskStatus = "pending" | "active" | "paused" | "done";

export type MyTask = {
  id: string;
  name: string;
  status: TaskStatus;
  activated_at: string | null;
  completed_at: string | null;
  allocation_id: string;
  allocation: {
    id: string;
    start_date: string;
    end_date: string;
    hours_per_day: number;
    resource_id: string;
    stage: {
      id: string;
      name: string;
      color: string;
      project: {
        id: string;
        name: string;
        client: string | null;
        color: string;
      };
    };
  };
  hours_logged_total: number;
  hours_logged_today: number;
};

export function useMyTasks(opts: { resourceId: string | null; userId: string | null; scope: "mine" | "all" }) {
  return useQuery({
    queryKey: ["pm-my-tasks", opts.scope, opts.resourceId, opts.userId],
    queryFn: async (): Promise<MyTask[]> => {
      if (opts.scope === "mine" && !opts.resourceId) return [];

      const { data, error } = await supabase
        .from("pm_tasks")
        .select(
          "id, name, status, activated_at, completed_at, allocation_id, allocation:pm_allocations(id, start_date, end_date, hours_per_day, resource_id, stage:pm_stages(id, name, color, project:pm_projects(id, name, client, color)))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;

      let rows = (data ?? []) as unknown as Omit<MyTask, "hours_logged_total" | "hours_logged_today">[];

      if (opts.scope === "mine" && opts.resourceId) {
        rows = rows.filter((r) => r.allocation?.resource_id === opts.resourceId);
      }

      const taskIds = rows.map((r) => r.id);
      const today = new Date().toISOString().slice(0, 10);
      const totals = new Map<string, number>();
      const todays = new Map<string, number>();

      if (taskIds.length > 0) {
        const { data: entries } = await supabase
          .from("pm_time_entries")
          .select("task_id, hours, entry_date")
          .in("task_id", taskIds)
          .not("task_id", "is", null);
        for (const e of (entries ?? []) as Array<{ task_id: string; hours: number; entry_date: string }>) {
          totals.set(e.task_id, (totals.get(e.task_id) ?? 0) + Number(e.hours));
          if (e.entry_date === today) {
            todays.set(e.task_id, (todays.get(e.task_id) ?? 0) + Number(e.hours));
          }
        }
      }

      return rows.map((r) => ({
        ...r,
        hours_logged_total: totals.get(r.id) ?? 0,
        hours_logged_today: todays.get(r.id) ?? 0,
      })) as MyTask[];
    },
    enabled: opts.scope === "all" || !!opts.resourceId,
  });
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("pm_tasks").update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-my-tasks"] });
    },
  });
}

export type TimeEntry = {
  id: string;
  task_id: string;
  user_id: string;
  entry_date: string;
  hours: number;
  notes: string | null;
  started_at: string | null;
  ended_at: string | null;
  source: string;
  created_at: string;
};

export function useTaskTimeEntries(taskId: string | null) {
  return useQuery({
    queryKey: ["pm-task-entries", taskId],
    queryFn: async (): Promise<TimeEntry[]> => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from("pm_time_entries")
        .select("*")
        .eq("task_id", taskId)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TimeEntry[];
    },
    enabled: !!taskId,
  });
}

export function useLogTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      task_id: string;
      user_id: string;
      entry_date: string;
      hours: number;
      notes?: string;
    }) => {
      const { error } = await supabase.from("pm_time_entries").insert({
        task_id: input.task_id,
        user_id: input.user_id,
        entry_date: input.entry_date,
        hours: input.hours,
        notes: input.notes ?? null,
        source: "manual",
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-my-tasks"] });
      qc.invalidateQueries({ queryKey: ["pm-task-entries", vars.task_id] });
    },
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; task_id: string }) => {
      const { error } = await supabase.from("pm_time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-my-tasks"] });
      qc.invalidateQueries({ queryKey: ["pm-task-entries", vars.task_id] });
    },
  });
}
