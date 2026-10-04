/**
 * Non-working days (public holiday, weekend, approved full-day leave) for the
 * signed-in person — display only. The database trigger pm_time_entry_nwd sets
 * pm_time_entries.non_working_day_reason; this hook mirrors that rule so the
 * timesheet and the assistant can warn before saving. Saving is never blocked.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import type { Locale } from "date-fns";
import type { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";

export type NonWorkingReason = "holiday" | "weekend" | "leave";
export type NonWorkingInfo = { reason: NonWorkingReason; name: string | null };

function addDaysISO(d: string, n: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function useNonWorkingDays(from: string | null, to: string | null) {
  return useQuery({
    queryKey: ["non-working-days", from, to],
    enabled: !!from && !!to,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, NonWorkingInfo>> => {
      const out = new Map<string, NonWorkingInfo>();
      const [hol, collab] = await Promise.all([
        supabase.from("holidays").select("data, nome").gte("data", from!).lte("data", to!),
        supabase.rpc("get_my_collaborator_id"),
      ]);
      let leave: Array<{ data_inicio: string; data_fim: string }> = [];
      if (collab.data) {
        const { data } = await supabase
          .from("vacation_requests")
          .select("data_inicio, data_fim")
          .eq("collaborator_id", collab.data as string)
          .eq("estado", "aprovada")
          .eq("periodo", "dia_inteiro")
          .lte("data_inicio", to!)
          .gte("data_fim", from!);
        leave = data ?? [];
      }
      const holidays = new Map((hol.data ?? []).map((h) => [h.data as string, h.nome as string]));
      for (let d = from!; d <= to!; d = addDaysISO(d, 1)) {
        const dow = new Date(d + "T00:00:00Z").getUTCDay();
        if (holidays.has(d)) out.set(d, { reason: "holiday", name: holidays.get(d)! });
        else if (leave.some((l) => d >= l.data_inicio && d <= l.data_fim)) out.set(d, { reason: "leave", name: null });
        else if (dow === 0 || dow === 6) out.set(d, { reason: "weekend", name: null });
      }
      return out;
    },
  });
}

/** "4 jun é feriado (Corpo de Deus). Estas horas vão precisar de aprovação." */
export function nonWorkingLine(t: TFunction, date: string, info: NonWorkingInfo, locale?: Locale) {
  return t(`projects:nonWorkingDay.line.${info.reason}`, {
    date: format(parseISO(date), "d MMM", { locale }),
    name: info.name ?? "",
  });
}

/** Pending entries on non-working days for one person and week. */
export function useNonWorkingPendingCount(userId: string | null | undefined, weekStart: string | null, weekEnd: string | null) {
  return useQuery({
    queryKey: ["nwd-pending", userId, weekStart, weekEnd],
    enabled: !!userId && !!weekStart && !!weekEnd,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("pm_time_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .gte("entry_date", weekStart!)
        .lte("entry_date", weekEnd!)
        .not("non_working_day_reason", "is", null)
        .eq("approval_status", "pending")
        .gt("hours", 0);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export type NonWorkingQueueEntry = {
  id: string;
  user_id: string;
  user_name: string | null;
  entry_date: string;
  hours: number;
  reason: NonWorkingReason;
  holiday: string | null;
  notes: string | null;
  label: string;
  project_id: string | null;
};

/** All pending entries on non-working days (approval queue, admins). */
export function useNonWorkingQueue(enabled: boolean) {
  return useQuery({
    queryKey: ["nwd-queue"],
    enabled,
    queryFn: async (): Promise<NonWorkingQueueEntry[]> => {
      const { data, error } = await supabase
        .from("pm_time_entries")
        .select("id, user_id, entry_date, hours, notes, entry_type, internal_category, task_id, pm_stage_id, non_working_day_reason")
        .not("non_working_day_reason", "is", null)
        .eq("approval_status", "pending")
        .gt("hours", 0)
        .order("entry_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = data ?? [];
      const users = [...new Set(rows.map((r) => r.user_id))];
      const taskIds = [...new Set(rows.map((r) => r.task_id).filter(Boolean) as string[])];
      const stageIds = [...new Set(rows.map((r) => r.pm_stage_id).filter(Boolean) as string[])];
      const dates = rows.map((r) => r.entry_date).sort();
      const [names, tasks, stages, hols] = await Promise.all([
        users.length ? supabase.rpc("pm_resource_map_for_users", { _user_ids: users }) : Promise.resolve({ data: [] }),
        taskIds.length
          ? supabase.from("pm_tasks").select("id, allocation:pm_allocations(stage:pm_stages(id, name, project:pm_projects(id, name)))").in("id", taskIds)
          : Promise.resolve({ data: [] }),
        stageIds.length ? supabase.from("pm_stages").select("id, name, project:pm_projects(id, name)").in("id", stageIds) : Promise.resolve({ data: [] }),
        dates.length ? supabase.from("holidays").select("data, nome").gte("data", dates[0]).lte("data", dates[dates.length - 1]) : Promise.resolve({ data: [] }),
      ]);
      const nameOf = new Map(((names.data ?? []) as Array<{ user_id: string; name: string | null }>).map((m) => [m.user_id, m.name]));
      type St = { id: string; name: string; project: { id: string; name: string } | null };
      const taskStage = new Map<string, St>();
      for (const t of (tasks.data ?? []) as unknown as Array<{ id: string; allocation: { stage: St | null } | null }>) {
        if (t.allocation?.stage) taskStage.set(t.id, t.allocation.stage);
      }
      const stageById = new Map(((stages.data ?? []) as unknown as St[]).map((s) => [s.id, s]));
      const holName = new Map(((hols.data ?? []) as Array<{ data: string; nome: string }>).map((h) => [h.data, h.nome]));
      return rows.map((r) => {
        const st = (r.pm_stage_id && stageById.get(r.pm_stage_id)) || (r.task_id && taskStage.get(r.task_id)) || null;
        const label = st ? `${st.project?.name ?? "?"} · ${st.name}` : r.internal_category ?? r.entry_type;
        return {
          id: r.id,
          user_id: r.user_id,
          user_name: nameOf.get(r.user_id) ?? null,
          entry_date: r.entry_date,
          hours: Number(r.hours),
          reason: r.non_working_day_reason as NonWorkingReason,
          holiday: holName.get(r.entry_date) ?? null,
          notes: r.notes,
          label,
          project_id: st?.project?.id ?? null,
        };
      });
    },
  });
}

/** Approve or reject ONE non-working-day entry (never in bulk). */
export function useDecideNonWorkingEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; approve: boolean; reason?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("pm_time_entries")
        .update({
          approval_status: input.approve ? "approved" : "rejected",
          approved_at: new Date().toISOString(),
          approved_by: u.user?.id ?? null,
          ...(input.approve ? {} : { rejection_reason: input.reason ?? null }),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nwd-queue"] });
      qc.invalidateQueries({ queryKey: ["nwd-pending"] });
      qc.invalidateQueries({ queryKey: ["hour-approvals"] });
      qc.invalidateQueries({ queryKey: ["pending-approvals-summary"] });
    },
  });
}
