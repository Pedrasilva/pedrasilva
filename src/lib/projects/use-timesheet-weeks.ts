/**
 * Weekly timesheet approval layer.
 *
 * This sits ON TOP of `pm_time_entries`, which stays the single source of
 * truth for hours. A `pm_timesheet_weeks` row only records the state of the
 * week (open → submitted → returned / approved), who acted on it, and a
 * snapshot of the totals at submission / approval time.
 *
 * It is deliberately separate from the per-entry approval queue used by
 * `/projects/approvals` (`pm_time_entries.approval_status`): that answers a
 * project-management question ("should these hours be billed?"), this one
 * answers an HR/workload question ("is this person's week complete and can it
 * be closed?"). Neither reads or writes the other's state.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sendWeekWorkflowEmails } from "@/lib/projects/timesheet-week-email.functions";

/** Best-effort email copy of the bell notifications the DB just created. */
function emailWeekWorkflow(weekId: string | null | undefined) {
  if (!weekId) return;
  void sendWeekWorkflowEmails({ data: { weekId } }).catch(() => undefined);
}

export type WeekStatus = "open" | "submitted" | "returned" | "approved";

export interface TimesheetWeek {
  id: string;
  user_id: string;
  collaborator_id: string | null;
  week_start: string;
  week_end: string;
  status: WeekStatus;
  submitted_at: string | null;
  submitted_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  returned_at: string | null;
  returned_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  reviewer_comment: string | null;
  was_approved_before: boolean;
  weekly_capacity_hours: number;
  total_accounted_hours: number;
  total_working_hours: number;
  total_project_hours: number;
  total_internal_hours: number;
  total_leave_hours: number;
  calculated_excess_hours: number;
  additional_hours_approved: number;
  additional_hours_note: string | null;
  shortfall_hours_approved: number;
  /** Owner asked for a change on a submitted/approved week (cleared by any approver action). */
  change_requested_at: string | null;
  change_request_reason: string | null;
  /** The owner approved their own week (only allowed when nobody else approves it). */
  self_approved: boolean;
}

/**
 * Hour buckets for one person-week. These stay conceptually separate on
 * purpose:
 *   - `project`  — time on project stages/tasks (productive)
 *   - `internal` — internal cost centres (still actual work)
 *   - `leave`    — annual leave, authorised absence, public holidays
 *   - `working`  — project + internal (what a person actually worked)
 *   - `accounted`— working + leave (what the week accounts for)
 *
 * Only `working` is ever compared against the weekly capacity, so a week made
 * up of work plus leave can never look like overtime.
 */
export interface WeekTotals {
  project: number;
  internal: number;
  leave: number;
  working: number;
  accounted: number;
}

export const EMPTY_TOTALS: WeekTotals = {
  project: 0,
  internal: 0,
  leave: 0,
  working: 0,
  accounted: 0,
};

/** Label of approved unpaid leave rows; shown on the timesheet but never accounted. */
export const UNPAID_LEAVE_LABEL = "Authorized (unpaid)";
export const isUnpaidLeave = (e: { entry_type: string; leave_type?: string | null }) =>
  e.entry_type === "non_working" && e.leave_type === UNPAID_LEAVE_LABEL;

export function totalsFromEntries(
  entries: Array<{ entry_type: string; hours: number; leave_type?: string | null }>,
): WeekTotals {
  let project = 0;
  let internal = 0;
  let leave = 0;
  for (const e of entries) {
    const h = Number(e.hours) || 0;
    // Unpaid leave is time owed: visible on the timesheet, never accounted.
    if (isUnpaidLeave(e)) continue;
    if (e.entry_type === "project") project += h;
    else if (e.entry_type === "internal") internal += h;
    else leave += h;
  }
  const working = project + internal;
  return { project, internal, leave, working, accounted: working + leave };
}

/** Hours the week is short of capacity (accounted vs capacity, never negative). */
export function shortfallHours(totals: WeekTotals, capacity: number): number {
  return Math.max(0, round2(capacity - totals.accounted));
}

/** Hours worked above the person's own normal weekly capacity (never negative). */
export function excessHours(totals: WeekTotals, capacity: number): number {
  return Math.max(0, round2(totals.working - capacity));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const DEFAULT_DAILY_HOURS = 8;
export const DEFAULT_DAYS_PER_WEEK = 5;

/**
 * Normal weekly capacity for a collaborator, derived from the existing HR
 * contract fields. Never hardcoded to 40h — a part-time 6h × 5d contract
 * resolves to 30h and every warning follows that number.
 */
export function useWeeklyCapacity(collaboratorId: string | null) {
  return useQuery({
    queryKey: ["pm-weekly-capacity", collaboratorId],
    enabled: !!collaboratorId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators_directory")
        .select("daily_hours, days_per_week")
        .eq("id", collaboratorId!)
        .maybeSingle();
      if (error) throw error;
      const row = data as { daily_hours: number | null; days_per_week: number | null } | null;
      const daily = Number(row?.daily_hours ?? DEFAULT_DAILY_HOURS) || DEFAULT_DAILY_HOURS;
      const days = Number(row?.days_per_week ?? DEFAULT_DAYS_PER_WEEK) || DEFAULT_DAYS_PER_WEEK;
      return { dailyHours: daily, daysPerWeek: days, weeklyCapacity: round2(daily * days) };
    },
  });
}

const WEEK_COLUMNS =
  "id, user_id, collaborator_id, week_start, week_end, status, submitted_at, submitted_by, approved_at, approved_by, returned_at, returned_by, reopened_at, reopened_by, reopen_reason, reviewer_comment, was_approved_before, weekly_capacity_hours, total_accounted_hours, total_working_hours, total_project_hours, total_internal_hours, total_leave_hours, calculated_excess_hours, additional_hours_approved, additional_hours_note, shortfall_hours_approved, change_requested_at, change_request_reason, self_approved";

function normaliseWeek(row: Record<string, unknown>): TimesheetWeek {
  const num = (k: string) => Number(row[k] ?? 0) || 0;
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    collaborator_id: (row.collaborator_id as string | null) ?? null,
    week_start: row.week_start as string,
    week_end: row.week_end as string,
    status: row.status as WeekStatus,
    submitted_at: (row.submitted_at as string | null) ?? null,
    submitted_by: (row.submitted_by as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    approved_by: (row.approved_by as string | null) ?? null,
    returned_at: (row.returned_at as string | null) ?? null,
    returned_by: (row.returned_by as string | null) ?? null,
    reopened_at: (row.reopened_at as string | null) ?? null,
    reopened_by: (row.reopened_by as string | null) ?? null,
    reopen_reason: (row.reopen_reason as string | null) ?? null,
    reviewer_comment: (row.reviewer_comment as string | null) ?? null,
    was_approved_before: !!row.was_approved_before,
    weekly_capacity_hours: num("weekly_capacity_hours"),
    total_accounted_hours: num("total_accounted_hours"),
    total_working_hours: num("total_working_hours"),
    total_project_hours: num("total_project_hours"),
    total_internal_hours: num("total_internal_hours"),
    total_leave_hours: num("total_leave_hours"),
    calculated_excess_hours: num("calculated_excess_hours"),
    additional_hours_approved: num("additional_hours_approved"),
    additional_hours_note: (row.additional_hours_note as string | null) ?? null,
    shortfall_hours_approved: num("shortfall_hours_approved"),
    change_requested_at: (row.change_requested_at as string | null) ?? null,
    change_request_reason: (row.change_request_reason as string | null) ?? null,
    self_approved: !!row.self_approved,
  };
}

/** The week record for one person, or null when they have never submitted it. */
export function useTimesheetWeek(opts: { userId: string | null; weekStart: string }) {
  return useQuery({
    queryKey: ["pm-timesheet-week", opts.userId, opts.weekStart],
    enabled: !!opts.userId,
    queryFn: async (): Promise<TimesheetWeek | null> => {
      const { data, error } = await supabase
        .from("pm_timesheet_weeks")
        .select(WEEK_COLUMNS)
        .eq("user_id", opts.userId!)
        .eq("week_start", opts.weekStart)
        .maybeSingle();
      if (error) throw error;
      return data ? normaliseWeek(data as Record<string, unknown>) : null;
    },
  });
}

/** True when the collaborator can no longer edit their own entries. */
export function isWeekLocked(week: TimesheetWeek | null | undefined): boolean {
  return week?.status === "submitted" || week?.status === "approved";
}

function invalidateWeeks(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["pm-timesheet-week"] });
  qc.invalidateQueries({ queryKey: ["pm-week-approvals"] });
  qc.invalidateQueries({ queryKey: ["pm-timesheet-entries"] });
  qc.invalidateQueries({ queryKey: ["pm-hours-bank"] });
}

export interface SubmitWeekInput {
  userId: string;
  collaboratorId: string | null;
  weekStart: string;
  weekEnd: string;
  capacity: number;
  totals: WeekTotals;
}

/** Collaborator action: hand the week over for review. */
export function useSubmitWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitWeekInput) => {
      const now = new Date().toISOString();
      const payload = {
        user_id: input.userId,
        collaborator_id: input.collaboratorId,
        week_start: input.weekStart,
        week_end: input.weekEnd,
        status: "submitted" as const,
        submitted_at: now,
        submitted_by: input.userId,
        weekly_capacity_hours: input.capacity,
        total_accounted_hours: round2(input.totals.accounted),
        total_working_hours: round2(input.totals.working),
        total_project_hours: round2(input.totals.project),
        total_internal_hours: round2(input.totals.internal),
        total_leave_hours: round2(input.totals.leave),
        calculated_excess_hours: excessHours(input.totals, input.capacity),
      };
      const { data, error } = await supabase
        .from("pm_timesheet_weeks")
        .upsert(payload as never, { onConflict: "user_id,week_start" })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      emailWeekWorkflow((data as { id: string } | null)?.id);
    },
    onSuccess: () => invalidateWeeks(qc),
  });
}

export interface ApproveWeekInput {
  weekId: string;
  approverId: string;
  collaboratorId: string | null;
  weekStart: string;
  weekEnd?: string;
  /** Hours the approver explicitly acknowledges. Never above the calculated excess. */
  additionalHours: number;
  calculatedExcess: number;
  /** Shortfall the approver keeps as a debit. Never above the calculated shortfall. */
  shortfallHours?: number;
  calculatedShortfall?: number;
  note: string | null;
  comment: string | null;
}

/**
 * Approver action: close the week and reconcile the hours bank.
 *
 * A week has at most ONE bank movement (credit `additional_hours` or debit
 * `shortfall`, enforced by a unique index). Re-approval replaces it. Weeks
 * ending before the person's opening-balance "as of" date never move the bank.
 */
export function useApproveWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApproveWeekInput) => {
      let credit = Math.max(0, Math.min(input.additionalHours, input.calculatedExcess));
      let debit = Math.max(
        0,
        Math.min(input.shortfallHours ?? 0, input.calculatedShortfall ?? 0),
      );
      if (credit > 0) debit = 0;
      const now = new Date().toISOString();

      // Respect the opening balance: earlier weeks are covered by it.
      if (input.collaboratorId && (credit > 0 || debit > 0)) {
        const { data: opening } = await supabase
          .from("pm_hours_bank_entries")
          .select("as_of_date")
          .eq("collaborator_id", input.collaboratorId)
          .eq("transaction_type", "opening_balance")
          .maybeSingle();
        const asOf = (opening as { as_of_date: string | null } | null)?.as_of_date;
        const weekEnd = input.weekEnd ?? input.weekStart;
        if (asOf && weekEnd < asOf) {
          credit = 0;
          debit = 0;
        }
      }

      const { error } = await supabase
        .from("pm_timesheet_weeks")
        .update({
          status: "approved",
          approved_at: now,
          approved_by: input.approverId,
          additional_hours_approved: credit,
          additional_hours_note: input.note,
          shortfall_hours_approved: debit,
          reviewer_comment: input.comment,
        } as never)
        .eq("id", input.weekId);
      if (error) throw error;
      emailWeekWorkflow(input.weekId);

      // Replace this week's movement (credit or debit).
      const { error: dErr } = await supabase
        .from("pm_hours_bank_entries")
        .delete()
        .eq("week_id", input.weekId)
        .in("transaction_type", ["additional_hours", "shortfall"]);
      if (dErr) throw dErr;

      if (!input.collaboratorId || (credit <= 0 && debit <= 0)) return;
      const { error: iErr } = await supabase.from("pm_hours_bank_entries").insert({
        collaborator_id: input.collaboratorId,
        week_id: input.weekId,
        entry_date: input.weekStart,
        transaction_type: credit > 0 ? "additional_hours" : "shortfall",
        hours: credit > 0 ? credit : -debit,
        reason: input.note,
        created_by: input.approverId,
      } as never);
      if (iErr) throw iErr;
    },
    onSuccess: () => {
      invalidateWeeks(qc);
      qc.invalidateQueries({ queryKey: ["pm-hours-bank"] });
    },
  });
}

/** Approver action: hand the week back so the collaborator can correct it. */
export function useReturnWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { weekId: string; approverId: string; comment: string }) => {
      const { error } = await supabase
        .from("pm_timesheet_weeks")
        .update({
          status: "returned",
          returned_at: new Date().toISOString(),
          returned_by: input.approverId,
          reviewer_comment: input.comment,
        } as never)
        .eq("id", input.weekId);
      if (error) throw error;
      emailWeekWorkflow(input.weekId);
    },
    onSuccess: () => invalidateWeeks(qc),
  });
}

/**
 * Approver action: reopen a closed week.
 *
 * `was_approved_before` stays true so the history of the earlier approval is
 * never lost, and the existing hours-bank entry is left in place until the week
 * is approved again — at which point it is reconciled, not duplicated.
 */
export function useReopenWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { weekId: string; approverId: string; reason: string }) => {
      const { error } = await supabase
        .from("pm_timesheet_weeks")
        .update({
          status: "open",
          reopened_at: new Date().toISOString(),
          reopened_by: input.approverId,
          reopen_reason: input.reason,
        } as never)
        .eq("id", input.weekId);
      if (error) throw error;
      emailWeekWorkflow(input.weekId);
    },
    onSuccess: () => invalidateWeeks(qc),
  });
}

/**
 * Owner action: ask the approver to change a submitted or approved week.
 * Only records the request (status is untouched); the approver then returns
 * or reopens the week. A DB trigger validates it and notifies approvers.
 */
export function useRequestWeekChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { weekId: string; reason: string }) => {
      const reason = input.reason.trim();
      if (!reason) throw new Error("Reason required");
      const { error } = await supabase
        .from("pm_timesheet_weeks")
        .update({ change_requested_at: new Date().toISOString(), change_request_reason: reason } as never)
        .eq("id", input.weekId);
      if (error) throw error;
      emailWeekWorkflow(input.weekId);
    },
    onSuccess: () => invalidateWeeks(qc),
  });
}

/** True when the signed-in user may approve their own week (no other approver covers it). */
export function useCanSelfApprove(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["pm-week-can-self-approve", userId],
    enabled: !!userId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pm_week_can_self_approve", { _target_user_id: userId! });
      if (error) throw error;
      return !!data;
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Approver overview
// ─────────────────────────────────────────────────────────────

export interface WeeklyApprovalRow {
  userId: string;
  collaboratorId: string | null;
  name: string;
  capacity: number;
  totals: WeekTotals;
  excess: number;
  /** Hours short of capacity (accounted < capacity). */
  shortfall: number;
  week: TimesheetWeek | null;
  status: WeekStatus | "not_submitted";
}

/**
 * Everyone who can log time, with their live totals for the selected week and
 * the state of their weekly record.
 */
export function useWeeklyApprovalOverview(weekStart: string, weekEnd: string) {
  return useQuery({
    queryKey: ["pm-week-approvals", weekStart],
    queryFn: async (): Promise<WeeklyApprovalRow[]> => {
      const [mapRes, dirRes, weekRes, entryRes] = await Promise.all([
        supabase.rpc("pm_list_user_resource_map"),
        supabase
          .from("collaborators_directory")
          .select("id, nome, daily_hours, days_per_week, archived_at"),
        supabase
          .from("pm_timesheet_weeks")
          .select(WEEK_COLUMNS)
          .eq("week_start", weekStart),
        supabase
          .from("pm_time_entries")
          .select("user_id, hours, entry_type, leave_type")
          .gte("entry_date", weekStart)
          .lte("entry_date", weekEnd),
      ]);
      if (mapRes.error) throw mapRes.error;
      if (dirRes.error) throw dirRes.error;
      if (weekRes.error) throw weekRes.error;
      if (entryRes.error) throw entryRes.error;

      const directory = new Map(
        ((dirRes.data ?? []) as Array<{
          id: string;
          nome: string | null;
          daily_hours: number | null;
          days_per_week: number | null;
          archived_at: string | null;
        }>).map((c) => [c.id, c]),
      );

      const weeks = new Map(
        ((weekRes.data ?? []) as Array<Record<string, unknown>>)
          .map(normaliseWeek)
          .map((w) => [w.user_id, w]),
      );

      const entriesByUser = new Map<
        string,
        Array<{ entry_type: string; hours: number; leave_type: string | null }>
      >();
      for (const e of (entryRes.data ?? []) as Array<{
        user_id: string;
        hours: number;
        entry_type: string;
        leave_type: string | null;
      }>) {
        const list = entriesByUser.get(e.user_id) ?? [];
        list.push({ entry_type: e.entry_type, hours: Number(e.hours) || 0, leave_type: e.leave_type });
        entriesByUser.set(e.user_id, list);
      }

      const rows: WeeklyApprovalRow[] = [];
      const seen = new Set<string>();
      for (const m of (mapRes.data ?? []) as Array<{
        user_id: string;
        resource_id: string | null;
        name: string | null;
        collaborator_id: string | null;
      }>) {
        if (seen.has(m.user_id)) continue;
        seen.add(m.user_id);
        const collab = m.collaborator_id ? directory.get(m.collaborator_id) : undefined;
        // Only people who are actually part of the studio roster.
        if (!collab || collab.archived_at) continue;

        const totals = totalsFromEntries(entriesByUser.get(m.user_id) ?? []);
        const capacity = round2(
          (Number(collab.daily_hours ?? DEFAULT_DAILY_HOURS) || DEFAULT_DAILY_HOURS) *
            (Number(collab.days_per_week ?? DEFAULT_DAYS_PER_WEEK) || DEFAULT_DAYS_PER_WEEK),
        );
        const week = weeks.get(m.user_id) ?? null;
        rows.push({
          userId: m.user_id,
          collaboratorId: m.collaborator_id,
          name: collab.nome ?? m.name ?? "—",
          capacity,
          totals,
          excess: excessHours(totals, capacity),
          shortfall: shortfallHours(totals, capacity),
          week,
          status: week ? week.status : "not_submitted",
        });
      }
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export interface WeekBreakdownRow {
  key: string;
  label: string;
  kind: "project" | "internal" | "leave";
  hours: number;
}

/** Per project / activity breakdown used by the individual week review. */
export function useWeekBreakdown(opts: {
  userId: string | null;
  weekStart: string;
  weekEnd: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ["pm-week-breakdown", opts.userId, opts.weekStart],
    enabled: !!opts.userId && opts.enabled !== false,
    queryFn: async (): Promise<{ rows: WeekBreakdownRow[]; daily: Array<{ date: string; hours: number; label: string; notes: string | null }> }> => {
      const { data, error } = await supabase
        .from("pm_time_entries")
        .select(
          "id, entry_date, hours, notes, entry_type, internal_category, leave_type, task:pm_tasks(id, name, allocation:pm_allocations(stage:pm_stages(name, project:pm_projects(id, name))))",
        )
        .eq("user_id", opts.userId!)
        .gte("entry_date", opts.weekStart)
        .lte("entry_date", opts.weekEnd)
        .order("entry_date", { ascending: true });
      if (error) throw error;

      type Row = {
        id: string;
        entry_date: string;
        hours: number;
        notes: string | null;
        entry_type: string;
        internal_category: string | null;
        leave_type: string | null;
        task: {
          name: string;
          allocation: { stage: { name: string; project: { id: string; name: string } | null } | null } | null;
        } | null;
      };

      const agg = new Map<string, WeekBreakdownRow>();
      const daily: Array<{ date: string; hours: number; label: string; notes: string | null }> = [];

      for (const e of (data ?? []) as unknown as Row[]) {
        const hours = Number(e.hours) || 0;
        let key: string;
        let label: string;
        let kind: WeekBreakdownRow["kind"];
        if (e.entry_type === "project") {
          const project = e.task?.allocation?.stage?.project ?? null;
          key = `project:${project?.id ?? "unknown"}`;
          label = project?.name ?? e.task?.name ?? "Project";
          kind = "project";
        } else if (e.entry_type === "internal") {
          key = `internal:${e.internal_category ?? "internal"}`;
          label = e.internal_category ?? "Internal";
          kind = "internal";
        } else {
          key = `leave:${e.leave_type ?? "leave"}`;
          label = e.leave_type ?? "Leave";
          kind = "leave";
        }
        const cur = agg.get(key);
        if (cur) cur.hours = round2(cur.hours + hours);
        else agg.set(key, { key, label, kind, hours: round2(hours) });

        daily.push({ date: e.entry_date, hours, label, notes: e.notes });
      }

      const order = { project: 0, internal: 1, leave: 2 } as const;
      const rows = Array.from(agg.values()).sort(
        (a, b) => order[a.kind] - order[b.kind] || b.hours - a.hours,
      );
      return { rows, daily };
    },
  });
}
