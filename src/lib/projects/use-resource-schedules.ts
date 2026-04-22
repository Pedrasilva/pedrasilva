// Loads each resource's working schedule (daily_hours, days_per_week,
// weekly_capacity) from the HR collaborator record. Resources not linked to a
// collaborator fall back to the standard 8h × 5d full-time contract.
//
// This is THE single source of truth for "how many hours per day does this
// person work?" across project planning, forecasting, capacity, leave-impact
// and timesheet pre-fill.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_DAILY_HOURS, DEFAULT_DAYS_PER_WEEK, type ResourceSchedule } from "@/lib/projects/leave-capacity";

export interface ResourceScheduleEntry extends ResourceSchedule {
  resourceId: string;
  collaboratorId: string | null;
  weeklyCapacity: number;
}

export type ResourceScheduleMap = Map<string, ResourceScheduleEntry>;

export function useResourceSchedules() {
  return useQuery({
    queryKey: ["pm-resource-schedules"],
    queryFn: async (): Promise<ResourceScheduleMap> => {
      const { data: resources, error: rErr } = await supabase
        .from("pm_resources")
        .select("id, collaborator_id, weekly_capacity");
      if (rErr) throw rErr;

      const collabIds = ((resources ?? []) as Array<{ collaborator_id: string | null }>)
        .map((r) => r.collaborator_id)
        .filter((x): x is string => !!x);

      let collabMap = new Map<string, { dh: number; dpw: number }>();
      if (collabIds.length > 0) {
        const { data: collabs, error: cErr } = await supabase
          .from("collaborators")
          .select("id, daily_hours, days_per_week")
          .in("id", collabIds);
        if (cErr) throw cErr;
        collabMap = new Map(
          ((collabs ?? []) as Array<{ id: string; daily_hours: number; days_per_week: number }>).map(
            (c) => [c.id, { dh: Number(c.daily_hours), dpw: Number(c.days_per_week) }],
          ),
        );
      }

      const out: ResourceScheduleMap = new Map();
      for (const r of (resources ?? []) as Array<{
        id: string;
        collaborator_id: string | null;
        weekly_capacity: number;
      }>) {
        const c = r.collaborator_id ? collabMap.get(r.collaborator_id) : undefined;
        const dailyHours = c?.dh ?? DEFAULT_DAILY_HOURS;
        const daysPerWeek = c?.dpw ?? DEFAULT_DAYS_PER_WEEK;
        out.set(r.id, {
          resourceId: r.id,
          collaboratorId: r.collaborator_id,
          dailyHours,
          daysPerWeek,
          // Prefer the contract-derived weekly capacity (kept in sync via DB
          // trigger) but fall back to whatever pm_resources stores.
          weeklyCapacity: dailyHours * daysPerWeek || Number(r.weekly_capacity) || 40,
        });
      }
      return out;
    },
  });
}

/** Convenience: look up a resource's daily hours, defaulting to 8. */
export function dailyHoursFor(
  resourceId: string,
  schedules: ResourceScheduleMap | undefined,
): number {
  return schedules?.get(resourceId)?.dailyHours ?? DEFAULT_DAILY_HOURS;
}

/** Build a `DailyLimitMap` (resource_id → daily limit hours) for overload checks. */
export function buildDailyLimitMap(schedules: ResourceScheduleMap | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!schedules) return m;
  for (const [id, s] of schedules) m.set(id, s.dailyHours);
  return m;
}
