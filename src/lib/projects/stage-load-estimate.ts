/**
 * Estimated load for assignments that carry no hours (hours_per_day = 0 and no
 * allocation percentage). Pure — no Supabase. Used by the Capacity forecast
 * report and the timesheet allocation balance so both show the same estimate.
 *
 *   stage planned hours = Σ explicit allocation hours (hours_per_day), else
 *                         stage budget ÷ team average sale rate
 *                         (same rule as the project page's planned hours)
 *   remaining          = max(0, planned − all hours already logged on the stage)
 *   per person per day = remaining ÷ remaining working days ÷ people assigned
 *                        without explicit hours
 * Explicit hours or percentages always win; they are never estimated.
 */
import { allocationHours } from "@/lib/projects/gantt-utils";

export type LoadAlloc = {
  resource_id: string;
  stage_id: string;
  start_date: string;
  end_date: string;
  hours_per_day: number | null;
  allocation_percentage: number | null;
};

export const isImplicitAllocation = (a: Pick<LoadAlloc, "hours_per_day" | "allocation_percentage">) =>
  !(Number(a.hours_per_day) > 0) && !(Number(a.allocation_percentage) > 0);

/** Planned hours for a stage, as the project page shows them. */
export function stagePlannedHours(input: { allocations: LoadAlloc[]; budget: number | null; avgSaleRate: number }): number {
  const fromAllocs = input.allocations.reduce(
    (s, a) => s + allocationHours({ start_date: a.start_date, end_date: a.end_date, hours_per_day: Number(a.hours_per_day) || 0 }),
    0,
  );
  if (fromAllocs > 0) return fromAllocs;
  const budget = Number(input.budget) || 0;
  return budget > 0 && input.avgSaleRate > 0 ? budget / input.avgSaleRate : 0;
}

const addDay = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const isWeekday = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return d !== 0 && d !== 6;
};

/** Weekdays in [from, to] minus public holidays. */
export function workingDayList(from: string, to: string, holidays: Set<string>): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDay(d)) if (isWeekday(d) && !holidays.has(d)) out.push(d);
  return out;
}

export type StageLoadEstimate = {
  stageId: string;
  planned: number;
  logged: number;
  remaining: number;
  /** Remaining working days (from today, or the stage start if later). */
  days: string[];
  /** People assigned without explicit hours (resource ids). */
  implicit: string[];
  /** Estimated hours per implicit person per remaining working day. */
  perPersonDay: number;
  /** Estimated remaining hours per implicit person. */
  perPerson: number;
};

/** Null when the stage has no planned hours (it then adds nothing). */
export function estimateStageLoad(input: {
  stageId: string;
  planned: number;
  logged: number;
  start: string | null;
  end: string | null;
  today: string;
  holidays: Set<string>;
  allocations: LoadAlloc[];
}): StageLoadEstimate | null {
  if (!(input.planned > 0)) return null;
  const implicit = [...new Set(input.allocations.filter(isImplicitAllocation).map((a) => a.resource_id))];
  const remaining = Math.max(0, input.planned - input.logged);
  const from = input.start && input.start > input.today ? input.start : input.today;
  const days = input.end && input.end >= from ? workingDayList(from, input.end, input.holidays) : [];
  const n = implicit.length;
  return {
    stageId: input.stageId,
    planned: input.planned,
    logged: input.logged,
    remaining,
    days,
    implicit,
    perPersonDay: n && days.length ? remaining / days.length / n : 0,
    perPerson: n && days.length ? remaining / n : 0,
  };
}
