import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { expandNonWorkingForRange, type CollaboratorMapRow } from "@/lib/projects/non-working-sync";
import { fetchAll, loadRoster } from "./use-hours-logged";
import type { HealthEntry, LeaveDay } from "./company-health";
import { getStudioCost } from "./company-health.functions";

/** Entries, approved leave + holidays, task → stage map, roster and lead stages for [start, end]. */
export function useCompanyHealthData(start: string, end: string) {
  return useQuery({
    queryKey: ["report-company-health", start, end],
    enabled: !!start && !!end && start <= end,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const roster = await loadRoster();
      const userMap = new Map<string, CollaboratorMapRow>(
        roster.map((p) => [p.collaboratorId, { collaborator_id: p.collaboratorId, user_id: p.userId, daily_hours: Number(p.dailyHours) || 8 }]),
      );
      const [entries, tasks, leave, hol, leads] = await Promise.all([
        fetchAll<HealthEntry>((a, b) =>
          supabase
            .from("pm_time_entries")
            .select("user_id, task_id, entry_date, hours, billable, entry_type, cost_rate_snapshot, internal_category, opportunity_id, leave_type, non_working_day_reason, approval_status, cost_rate_source")
            .gte("entry_date", start)
            .lte("entry_date", end)
            .order("id")
            .range(a, b) as never,
        ),
        fetchAll<{ id: string; pm_allocations: { stage_id: string } | { stage_id: string }[] | null }>((a, b) =>
          supabase.from("pm_tasks").select("id, pm_allocations!inner(stage_id)").order("id").range(a, b) as never,
        ),
        expandNonWorkingForRange({ rangeStart: start, rangeEnd: end, userMap }),
        supabase.from("holidays").select("data").gte("data", start).lte("data", end),
        supabase.rpc("crm_leads_directory"),
      ]);
      if (hol.error) throw hol.error;
      if (leads.error) throw leads.error;
      const taskToStage = new Map<string, string>();
      for (const t of tasks) {
        const sid = Array.isArray(t.pm_allocations) ? t.pm_allocations[0]?.stage_id : t.pm_allocations?.stage_id;
        if (sid) taskToStage.set(t.id, sid);
      }
      return {
        roster,
        taskToStage,
        entries: entries.map((e) => ({ ...e, hours: Number(e.hours ?? 0), cost_rate_snapshot: e.cost_rate_snapshot == null ? null : Number(e.cost_rate_snapshot) })),
        leaveDays: leave as unknown as LeaveDay[],
        holidays: new Set((hol.data ?? []).map((h) => h.data as string)),
        lostLeads: new Set((leads.data ?? []).filter((l) => l.stage === "lost").map((l) => l.id)),
      };
    },
  });
}

/** Full studio cost per month, computed on the server (admins only; null otherwise). */
export function useStudioCost(months: { key: string; start: string; end: string }[], collaboratorIds: string[] | null) {
  const fn = useServerFn(getStudioCost);
  return useQuery({
    queryKey: ["report-studio-cost", months, collaboratorIds],
    enabled: months.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fn({ data: { months, collaboratorIds } }),
  });
}
