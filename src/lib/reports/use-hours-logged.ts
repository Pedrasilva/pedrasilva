import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  expandNonWorkingForRange,
  type CollaboratorMapRow,
} from "@/lib/projects/non-working-sync";
import {
  computeHoursLogged,
  mondayOf,
  type ReportEntry,
  type ReportWeekRow,
  type RosterPerson,
} from "./hours-logged";

const PAGE = 1000;

/** Page through a query so long periods are not cut at the 1000-row limit. */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Roster: same rule as the timesheet reminder and the weekly approval
 * overview — pm_list_user_resource_map, one row per user, collaborator
 * present and not archived.
 */
async function loadRoster(): Promise<RosterPerson[]> {
  const [mapRes, dirRes, resRes] = await Promise.all([
    supabase.rpc("pm_list_user_resource_map"),
    supabase
      .from("collaborators_directory")
      .select("id, nome, departamento, daily_hours, days_per_week, archived_at"),
    supabase.from("pm_resources").select("id, team"),
  ]);
  if (mapRes.error) throw mapRes.error;
  if (dirRes.error) throw dirRes.error;
  if (resRes.error) throw resRes.error;
  const dir = new Map((dirRes.data ?? []).map((c) => [c.id as string, c]));
  const teams = new Map((resRes.data ?? []).map((r) => [r.id, r.team]));
  const seen = new Set<string>();
  const out: RosterPerson[] = [];
  for (const m of mapRes.data ?? []) {
    if (!m.user_id || seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    const c = m.collaborator_id ? dir.get(m.collaborator_id) : undefined;
    if (!c || c.archived_at) continue;
    out.push({
      userId: m.user_id,
      collaboratorId: m.collaborator_id,
      name: c.nome ?? m.name ?? "—",
      department: c.departamento ?? null,
      team: (m.resource_id && teams.get(m.resource_id)) || null,
      dailyHours: c.daily_hours,
      daysPerWeek: c.days_per_week,
      startDate: null, // no admission date is stored on collaborators yet
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function useHoursLogged(rangeStart: string, rangeEnd: string) {
  return useQuery({
    queryKey: ["report-hours-logged", rangeStart, rangeEnd],
    enabled: !!rangeStart && !!rangeEnd && rangeStart <= rangeEnd,
    queryFn: async () => {
      const roster = await loadRoster();
      const userMap = new Map<string, CollaboratorMapRow>(
        roster.map((p) => [
          p.collaboratorId,
          { collaborator_id: p.collaboratorId, user_id: p.userId, daily_hours: Number(p.dailyHours) || 8 },
        ]),
      );
      const [entries, weekRows, nonWorking] = await Promise.all([
        fetchAll<ReportEntry>((a, b) =>
          supabase
            .from("pm_time_entries")
            .select("user_id, entry_date, entry_type, hours")
            .gte("entry_date", rangeStart)
            .lte("entry_date", rangeEnd)
            .order("id")
            .range(a, b) as never,
        ),
        fetchAll<ReportWeekRow>((a, b) =>
          supabase
            .from("pm_timesheet_weeks")
            .select("user_id, week_start, status")
            .gte("week_start", mondayOf(rangeStart))
            .lte("week_start", rangeEnd)
            .order("id")
            .range(a, b) as never,
        ),
        expandNonWorkingForRange({ rangeStart, rangeEnd, userMap }),
      ]);
      return computeHoursLogged({ rangeStart, rangeEnd, roster, entries, weekRows, nonWorking });
    },
  });
}
