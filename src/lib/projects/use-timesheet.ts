import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TimesheetTaskRow = {
  task_id: string;
  task_name: string;
  allocation_id: string;
  allocation_start: string;
  allocation_end: string;
  hours_per_day: number;
  resource_id: string;
  stage: { id: string; name: string; color: string };
  project: { id: string; name: string; client: string | null; color: string };
};

export type TimesheetEntry = {
  id: string;
  task_id: string;
  entry_date: string;
  hours: number;
  notes: string | null;
};

export function useTimesheetRows(opts: {
  resourceId: string | null;
  userId: string | null;
  weekStart: string;
  weekEnd: string;
  extraTaskIds: string[];
}) {
  return useQuery({
    queryKey: [
      "pm_timesheet-rows",
      opts.resourceId,
      opts.weekStart,
      opts.weekEnd,
      [...opts.extraTaskIds].sort().join(","),
    ],
    enabled: !!opts.resourceId && !!opts.userId,
    queryFn: async (): Promise<TimesheetTaskRow[]> => {
      if (!opts.resourceId) return [];

      const { data: allTasks, error } = await supabase
        .from("pm_tasks")
        .select(
          "id, name, allocation_id, allocation:pm_allocations!inner(id, start_date, end_date, hours_per_day, resource_id, stage:pm_stages(id, name, color, project:pm_projects(id, name, client, color)))",
        )
        .eq("allocation.resource_id", opts.resourceId);
      if (error) throw error;

      const rows = (allTasks ?? []) as unknown as Array<{
        id: string;
        name: string;
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
            project: { id: string; name: string; client: string | null; color: string };
          };
        };
      }>;

      const { data: weekEntries } = await supabase
        .from("pm_time_entries")
        .select("task_id")
        .gte("entry_date", opts.weekStart)
        .lte("entry_date", opts.weekEnd)
        .eq("user_id", opts.userId!);
      const taskIdsWithEntries = new Set((weekEntries ?? []).map((e) => e.task_id));

      const extras = new Set(opts.extraTaskIds);

      const filtered = rows.filter((r) => {
        const overlaps =
          r.allocation.start_date <= opts.weekEnd && r.allocation.end_date >= opts.weekStart;
        return overlaps || taskIdsWithEntries.has(r.id) || extras.has(r.id);
      });

      return filtered.map((r) => ({
        task_id: r.id,
        task_name: r.name,
        allocation_id: r.allocation.id,
        allocation_start: r.allocation.start_date,
        allocation_end: r.allocation.end_date,
        hours_per_day: Number(r.allocation.hours_per_day),
        resource_id: r.allocation.resource_id,
        stage: r.allocation.stage,
        project: r.allocation.stage.project,
      }));
    },
  });
}

export function useTimesheetEntries(opts: {
  userId: string | null;
  weekStart: string;
  weekEnd: string;
}) {
  return useQuery({
    queryKey: ["pm_timesheet-entries", opts.userId, opts.weekStart, opts.weekEnd],
    enabled: !!opts.userId,
    queryFn: async (): Promise<TimesheetEntry[]> => {
      const { data, error } = await supabase
        .from("pm_time_entries")
        .select("id, task_id, entry_date, hours, notes")
        .eq("user_id", opts.userId!)
        .gte("entry_date", opts.weekStart)
        .lte("entry_date", opts.weekEnd);
      if (error) throw error;
      return (data ?? []).map((e) => ({
        id: e.id,
        task_id: e.task_id,
        entry_date: e.entry_date,
        hours: Number(e.hours),
        notes: e.notes,
      }));
    },
  });
}

export function useUpsertTimesheetCell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      task_id: string;
      user_id: string;
      entry_date: string;
      hours: number;
      notes?: string | null;
      existing_entry_id: string | null;
    }) => {
      if (input.hours <= 0) {
        if (input.existing_entry_id) {
          const { error } = await supabase
            .from("pm_time_entries")
            .delete()
            .eq("id", input.existing_entry_id);
          if (error) throw error;
        }
        return;
      }
      if (input.existing_entry_id) {
        const { error } = await supabase
          .from("pm_time_entries")
          .update({ hours: input.hours, notes: input.notes ?? null } as never)
          .eq("id", input.existing_entry_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pm_time_entries").insert({
          task_id: input.task_id,
          user_id: input.user_id,
          entry_date: input.entry_date,
          hours: input.hours,
          notes: input.notes ?? null,
          source: "timesheet",
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm_timesheet-entries"] });
      qc.invalidateQueries({ queryKey: ["pm_timesheet-rows"] });
      qc.invalidateQueries({ queryKey: ["pm_my-tasks"] });
    },
  });
}

export type ProjectSearchResult = {
  id: string;
  name: string;
  client: string | null;
  color: string;
  stages: Array<{ id: string; name: string; color: string; start_date: string; end_date: string }>;
};

export function useProjectSearch(opts: { query: string }) {
  return useQuery({
    queryKey: ["pm_project-search", opts.query],
    enabled: opts.query.trim().length > 0,
    queryFn: async (): Promise<ProjectSearchResult[]> => {
      const q = opts.query.trim();
      const { data, error } = await supabase
        .from("pm_projects")
        .select(
          "id, name, client, color, stages:pm_stages(id, name, color, start_date, end_date, sort_order)",
        )
        .or(`name.ilike.%${q}%,client.ilike.%${q}%`)
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(15);
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        client: p.client,
        color: p.color,
        stages: ((p.stages ?? []) as Array<{
          id: string;
          name: string;
          color: string;
          start_date: string;
          end_date: string;
          sort_order: number;
        }>)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(({ id, name, color, start_date, end_date }) => ({
            id,
            name,
            color,
            start_date,
            end_date,
          })),
      }));
    },
  });
}

export function useEnsureStageRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      resource_id: string;
      stage_id: string;
      stage_start: string;
      stage_end: string;
    }): Promise<string> => {
      const { data: existingAlloc } = await supabase
        .from("pm_allocations")
        .select("id")
        .eq("resource_id", input.resource_id)
        .eq("stage_id", input.stage_id)
        .maybeSingle();

      let allocationId = existingAlloc?.id;

      if (!allocationId) {
        const { data: newAlloc, error: aErr } = await supabase
          .from("pm_allocations")
          .insert({
            resource_id: input.resource_id,
            stage_id: input.stage_id,
            start_date: input.stage_start,
            end_date: input.stage_end,
            hours_per_day: 0,
          } as never)
          .select("id")
          .single();
        if (aErr) throw aErr;
        allocationId = newAlloc.id;
      }

      const { data: task, error: tErr } = await supabase
        .from("pm_tasks")
        .select("id")
        .eq("allocation_id", allocationId!)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!task) throw new Error("Task not created for allocation");
      return task.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm_timesheet-rows"] });
      qc.invalidateQueries({ queryKey: ["pm_my-tasks"] });
    },
  });
}
