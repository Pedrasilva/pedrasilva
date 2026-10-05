import { toLocalISODate } from "@/lib/dates";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { APPROVED_LEAVE_STATES, leaveLabelFor } from "@/lib/projects/non-working-sync";

export type TimesheetTaskRow = {
  task_id: string;
  task_name: string;
  allocation_id: string;
  allocation_start: string;
  allocation_end: string;
  hours_per_day: number;
  resource_id: string;
  stage: { id: string; name: string; color: string; status?: string | null };
  project: { id: string; name: string; client: string | null; color: string };
  /** True when this person already has project hours on this task this week. */
  has_week_entries?: boolean;
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
  /** Pursuit entries only: the CRM lead the time was spent on. */
  opportunity_id: string | null;
  /** Open-logging retainer entries (no task) point straight at the month stage. */
  pm_stage_id?: string | null;
  /** "timesheet" (typed), "assistant", "calendar", "auto-nonworking"… */
  source?: string | null;
  approval_status?: string | null;
  non_working_day_reason?: string | null;
  calendar_event_ids?: string[] | null;
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
    staleTime: 2 * 60_000,

    queryFn: async (): Promise<TimesheetTaskRow[]> => {
      if (!opts.resourceId) return [];

      const { data: allTasks, error } = await supabase
        .from("pm_tasks")
        .select(
          "id, name, allocation_id, allocation:pm_allocations!inner(id, start_date, end_date, hours_per_day, resource_id, stage:pm_stages(id, name, color, status, project:pm_projects(id, name, client, color)))",
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
            status: string | null;
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
        has_week_entries: taskIdsWithEntries.has(r.id),
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
          "id, task_id, entry_date, hours, notes, billable, entry_type, internal_category, leave_type, opportunity_id, pm_stage_id, source, approval_status, non_working_day_reason, calendar_event_ids, created_at",
        )
        .eq("user_id", opts.userId!)
        .gte("entry_date", opts.weekStart)
        .lte("entry_date", opts.weekEnd)
        .order("created_at", { ascending: true });
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
        opportunity_id?: string | null;
        pm_stage_id?: string | null;
        source?: string | null;
        approval_status?: string | null;
        non_working_day_reason?: string | null;
        calendar_event_ids?: string[] | null;
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
        opportunity_id: e.opportunity_id ?? null,
        pm_stage_id: e.pm_stage_id ?? null,
        source: e.source ?? null,
        approval_status: e.approval_status ?? null,
        non_working_day_reason: e.non_working_day_reason ?? null,
        calendar_event_ids: e.calendar_event_ids ?? null,
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
          .select("data_inicio, data_fim, tipo, estado, periodo, horas")
          .eq("collaborator_id", opts.collaboratorId!)
          .in("estado", APPROVED_LEAVE_STATES as unknown as string[])
          .lte("data_inicio", opts.weekEnd)
          .gte("data_fim", opts.weekStart),
        supabase
          .from("holidays")
          .select("data, nome")
          .gte("data", opts.weekStart)
          .lte("data", opts.weekEnd),
        supabase
          .from("collaborators_directory")
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
        dayList.push(toLocalISODate(d));
      }

      // Public holiday dates in this week. A holiday always wins over leave:
      // the day is already non-working, so it must not also be counted
      // against the collaborator's leave (and must not double the day total).
      const holidayDates = new Set(
        ((holRes.data ?? []) as Array<{ data: string }>).map((h) => h.data),
      );

      // Vacations: each approved request fills its weekday range. Full-day
      // requests use the contractual daily hours; half-day requests (manhã /
      // tarde) use half of it; hour-based requests use exactly the approved
      // hours, so a 1h authorised absence never blocks a whole day.
      for (const v of (vacRes.data ?? []) as Array<{
        data_inicio: string;
        data_fim: string;
        tipo: string;
        periodo: string | null;
        horas: number | null;
      }>) {
        const label = leaveLabelFor(v.tipo);
        const m = ensure(label);
        const periodo = v.periodo ?? "dia_inteiro";
        const hoursForDay =
          periodo === "horas"
            ? Math.min(Number(v.horas ?? 0), dailyHours)
            : periodo === "manha" || periodo === "tarde" || periodo === "meio_dia"
              ? dailyHours / 2
              : dailyHours;
        if (hoursForDay <= 0) continue;
        for (const iso of dayList) {
          if (iso >= v.data_inicio && iso <= v.data_fim) {
            const dow = new Date(iso + "T00:00:00").getDay();
            if (dow === 0 || dow === 6) continue; // skip weekends
            if (holidayDates.has(iso)) continue; // public holiday takes over
            m.set(iso, hoursForDay);
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
      /** Pursuit entries only (internal_category = PURSUIT_CATEGORY). */
      opportunity_id?: string | null;
      user_id: string;
      entry_date: string;
      hours: number;
      notes?: string | null;
      billable?: boolean;
      existing_entry_id: string | null;
      /** Defaults to "timesheet"; the dictation assistant passes "assistant", calendar adds "calendar". */
      source?: string;
      /** New activities only: calendar events this activity records. */
      calendar_event_ids?: string[];
    }): Promise<string | null> => {
      if (input.hours <= 0) {
        if (input.existing_entry_id) {
          const { error } = await supabase
            .from("pm_time_entries")
            .delete()
            .eq("id", input.existing_entry_id);
          if (error) throw error;
        }
        return null;
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
        opportunity_id: input.opportunity_id ?? null,
      };
      if (input.existing_entry_id) {
        const { error } = await supabase
          .from("pm_time_entries")
          .update(payload as never)
          .eq("id", input.existing_entry_id);
        if (error) throw error;
        return input.existing_entry_id;
      }
      const { data, error } = await supabase
        .from("pm_time_entries")
        .insert({
          ...payload,
          user_id: input.user_id,
          entry_date: input.entry_date,
          source: input.source ?? "timesheet",
          ...(input.calendar_event_ids?.length ? { calendar_event_ids: input.calendar_event_ids } : {}),
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string } | null)?.id ?? null;
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
          "id, name, client, color, stages:pm_stages(id, name, color, start_date, end_date, sort_order, parent_stage_id, is_self, status, stage_kind)",
        )
        .or(`name.ilike.%${q}%,client.ilike.%${q}%`)
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(15);
      if (error) throw error;
      return (data ?? []).map((p) => {
        const raw = (p.stages ?? []) as Array<{
          id: string;
          name: string;
          color: string;
          start_date: string;
          end_date: string;
          sort_order: number;
          parent_stage_id: string | null;
          is_self: boolean | null;
          status: string | null;
          stage_kind: string | null;
        }>;
        const retainerParents = new Set(raw.filter((s) => s.stage_kind === "retainer_monthly").map((s) => s.id));
        // Only leaf, in-house rows are loggable: summary parents (any stage
        // that has children) and supplier stages are not time-tracked.
        const parentIds = new Set(
          raw.map((s) => s.parent_stage_id).filter(Boolean) as string[],
        );
        return {
          id: p.id,
          name: p.name,
          client: p.client,
          color: p.color,
          stages: raw
            // New hours only on active stages; retainer months take hours in their own month.
            .filter((s) => !parentIds.has(s.id) && s.is_self !== false)
            .filter((s) => s.status === "active" || (!!s.parent_stage_id && retainerParents.has(s.parent_stage_id)))
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(({ id, name, color, start_date, end_date }) => ({
              id,
              name,
              color,
              start_date,
              end_date,
            })),
        };
      });

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

/**
 * Per-stage allocation balance for one person: allocated = Σ working days ×
 * hours_per_day over their pm_allocations on the stage; logged = all their
 * project hours on that stage up to today (any week).
 */
export function useStageAllocationBalance(opts: { resourceId: string | null; userId: string | null; stageIds: string[] }) {
  const ids = [...new Set(opts.stageIds)].sort();
  return useQuery({
    queryKey: ["pm-timesheet-stage-balance", opts.resourceId, opts.userId, ids.join(",")],
    enabled: !!opts.resourceId && !!opts.userId && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const today = toLocalISODate(new Date());
      const [{ data: allocs, error: ae }, { data: tasks, error: te }] = await Promise.all([
        supabase.from("pm_allocations").select("stage_id, start_date, end_date, hours_per_day").eq("resource_id", opts.resourceId!).in("stage_id", ids),
        supabase.from("pm_tasks").select("id, pm_allocations!inner(stage_id, resource_id)").in("pm_allocations.stage_id", ids),
      ]);
      if (ae) throw ae;
      if (te) throw te;
      const taskStage = new Map<string, string>();
      for (const t of (tasks ?? []) as unknown as Array<{ id: string; pm_allocations: { stage_id: string } | { stage_id: string }[] }>) {
        const a = Array.isArray(t.pm_allocations) ? t.pm_allocations[0] : t.pm_allocations;
        if (a?.stage_id) taskStage.set(t.id, a.stage_id);
      }
      const out = new Map<string, { allocated: number; logged: number }>();
      for (const a of (allocs ?? []) as Array<{ stage_id: string; start_date: string; end_date: string; hours_per_day: number | null }>) {
        const cur = out.get(a.stage_id) ?? { allocated: 0, logged: 0 };
        cur.allocated += workingDaysBetween(a.start_date, a.end_date) * Number(a.hours_per_day ?? 0);
        out.set(a.stage_id, cur);
      }
      const taskIds = [...taskStage.keys()];
      for (let i = 0; i < taskIds.length; i += 200) {
        const { data: ents, error } = await supabase
          .from("pm_time_entries")
          .select("task_id, hours")
          .eq("user_id", opts.userId!)
          .eq("entry_type", "project")
          .lte("entry_date", today)
          .in("task_id", taskIds.slice(i, i + 200));
        if (error) throw error;
        for (const e of (ents ?? []) as Array<{ task_id: string; hours: number }>) {
          const sid = taskStage.get(e.task_id);
          const cur = sid ? out.get(sid) : undefined;
          if (cur) cur.logged += Number(e.hours ?? 0);
        }
      }
      return out;
    },
  });
}

function workingDaysBetween(start: string, end: string): number {
  let n = 0;
  const d = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  while (d <= e) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}
