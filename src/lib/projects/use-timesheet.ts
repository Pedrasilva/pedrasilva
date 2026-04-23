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

export type EntryType = "project" | "internal" | "non_working";

export type TimesheetEntry = {
  id: string;
  task_id: string | null;
  entry_date: string;
  hours: number;
  notes: string | null;
  billable: boolean;
  entry_type: EntryType;
  internal_category: string | null;
  leave_type: string | null;
};

// Internal cost centers are now admin-managed in the database
// (`pm_internal_categories`). Use `useInternalCategories()` from
// `@/lib/projects/use-internal-categories` to load the current active list.
//
// Category names are stored on `pm_time_entries.internal_category` as plain
// text, so historical entries keep rendering with their original label even
// after a category is archived or renamed.
export type InternalCategory = string;

export type NonWorkingRow = {
  // Stable key for this row inside the table (per leave_type)
  key: string;
  leave_type: string;
  // Pre-filled hours per ISO day (yyyy-mm-dd) coming from approved
  // vacation_requests + holidays. Keys missing → no auto entry that day.
  autoHoursByDate: Map<string, number>;
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
      "pm-timesheet-rows",
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
        .eq("user_id", opts.userId!)
        .eq("entry_type", "project")
        .not("task_id", "is", null);
      const taskIdsWithEntries = new Set(
        ((weekEntries ?? []) as Array<{ task_id: string | null }>)
          .map((e) => e.task_id)
          .filter((x): x is string => !!x),
      );

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
    queryKey: ["pm-timesheet-entries", opts.userId, opts.weekStart, opts.weekEnd],
    enabled: !!opts.userId,
    queryFn: async (): Promise<TimesheetEntry[]> => {
      const { data, error } = await supabase
        .from("pm_time_entries")
        .select(
          "id, task_id, entry_date, hours, notes, billable, entry_type, internal_category, leave_type",
        )
        .eq("user_id", opts.userId!)
        .gte("entry_date", opts.weekStart)
        .lte("entry_date", opts.weekEnd);
      if (error) throw error;
      type Row = {
        id: string;
        task_id: string | null;
        entry_date: string;
        hours: number;
        notes: string | null;
        billable?: boolean;
        entry_type?: EntryType;
        internal_category?: string | null;
        leave_type?: string | null;
      };
      return ((data ?? []) as unknown as Row[]).map((e) => ({
        id: e.id,
        task_id: e.task_id,
        entry_date: e.entry_date,
        hours: Number(e.hours),
        notes: e.notes,
        billable: e.billable ?? true,
        entry_type: e.entry_type ?? "project",
        internal_category: e.internal_category ?? null,
        leave_type: e.leave_type ?? null,
      }));
    },
  });
}

// Loads approved vacation_requests + holidays overlapping the week, and turns
// them into a map of NonWorkingRow keyed by leave_type.
//
// Hours per day come from the collaborator's HR profile
// (`collaborators.daily_hours`). Part-time users with e.g. a 4h/day contract
// will see 4h pre-filled per leave day, not 8h, so capacity / cost stay
// consistent with the rest of the planner.
export function useNonWorkingPrefill(opts: {
  collaboratorId: string | null;
  weekStart: string; // ISO Monday
  weekEnd: string; // ISO Sunday
}) {
  return useQuery({
    queryKey: ["pm-nonworking-prefill", opts.collaboratorId, opts.weekStart, opts.weekEnd],
    enabled: !!opts.collaboratorId,
    queryFn: async (): Promise<NonWorkingRow[]> => {
      const [vacRes, holRes, collabRes] = await Promise.all([
        supabase
          .from("vacation_requests")
          .select("data_inicio, data_fim, tipo, estado")
          .eq("collaborator_id", opts.collaboratorId!)
          .eq("estado", "aprovada")
          .lte("data_inicio", opts.weekEnd)
          .gte("data_fim", opts.weekStart),
        supabase
          .from("holidays")
          .select("data, nome")
          .gte("data", opts.weekStart)
          .lte("data", opts.weekEnd),
        supabase
          .from("collaborators")
          .select("daily_hours")
          .eq("id", opts.collaboratorId!)
          .maybeSingle(),
      ]);
      if (vacRes.error) throw vacRes.error;
      if (holRes.error) throw holRes.error;
      if (collabRes.error) throw collabRes.error;

      const dailyHours = Number(
        (collabRes.data as { daily_hours: number } | null)?.daily_hours ?? 8,
      );

      const byType = new Map<string, Map<string, number>>();
      const ensure = (k: string) => {
        let m = byType.get(k);
        if (!m) {
          m = new Map();
          byType.set(k, m);
        }
        return m;
      };

      // Iterate weekdays inside week
      const dayList: string[] = [];
      const start = new Date(opts.weekStart + "T00:00:00");
      const end = new Date(opts.weekEnd + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dayList.push(d.toISOString().slice(0, 10));
      }

      // Vacations: each approved request fills its weekday range with the
      // user's contractual daily hours.
      const labelFor = (t: string): string => {
        switch (t) {
          case "ferias":
            return "Vacation";
          case "casamento":
            return "Wedding leave";
          case "falecimento_familiar":
            return "Bereavement";
          case "assistencia_filho":
            return "Child assistance";
          case "nascimento_filho":
            return "Parental leave";
          case "trabalhador_estudante":
            return "Student worker";
          case "doacao_sangue":
            return "Blood donation";
          case "autorizada_paga":
            return "Authorized (paid)";
          case "autorizada_nao_paga":
            return "Authorized (unpaid)";
          default:
            return t;
        }
      };

      for (const v of (vacRes.data ?? []) as Array<{
        data_inicio: string;
        data_fim: string;
        tipo: string;
      }>) {
        const label = labelFor(v.tipo);
        const m = ensure(label);
        for (const iso of dayList) {
          if (iso >= v.data_inicio && iso <= v.data_fim) {
            const dow = new Date(iso + "T00:00:00").getDay();
            if (dow === 0 || dow === 6) continue; // skip weekends
            m.set(iso, dailyHours);
          }
        }
      }

      // Public holidays — also valued at the user's daily contract hours.
      for (const h of (holRes.data ?? []) as Array<{ data: string; nome: string }>) {
        const dow = new Date(h.data + "T00:00:00").getDay();
        if (dow === 0 || dow === 6) continue;
        const m = ensure(`Public holiday — ${h.nome}`);
        m.set(h.data, dailyHours);
      }

      return Array.from(byType, ([leave_type, autoHoursByDate]) => ({
        key: leave_type,
        leave_type,
        autoHoursByDate,
      }));
    },
  });
}

export function useUpsertTimesheetCell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entry_type: EntryType;
      task_id?: string | null;
      internal_category?: string | null;
      leave_type?: string | null;
      user_id: string;
      entry_date: string;
      hours: number;
      notes?: string | null;
      billable?: boolean;
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
      const billable = input.entry_type === "project" ? (input.billable ?? true) : false;
      const payload = {
        hours: input.hours,
        notes: input.notes ?? null,
        billable,
        entry_type: input.entry_type,
        task_id: input.task_id ?? null,
        internal_category: input.internal_category ?? null,
        leave_type: input.leave_type ?? null,
      };
      if (input.existing_entry_id) {
        const { error } = await supabase
          .from("pm_time_entries")
          .update(payload as never)
          .eq("id", input.existing_entry_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pm_time_entries").insert({
          ...payload,
          user_id: input.user_id,
          entry_date: input.entry_date,
          source: "timesheet",
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-timesheet-entries"] });
      qc.invalidateQueries({ queryKey: ["pm-timesheet-rows"] });
      qc.invalidateQueries({ queryKey: ["pm-my-tasks"] });
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
    queryKey: ["pm-project-search", opts.query],
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
      qc.invalidateQueries({ queryKey: ["pm-timesheet-rows"] });
      qc.invalidateQueries({ queryKey: ["pm-my-tasks"] });
    },
  });
}
