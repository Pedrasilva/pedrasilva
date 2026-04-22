// Utilities for computing how approved leave / public holidays reduce a
// resource's *delivery* capacity over a date window.
//
// Leave still appears as company COST in financials (handled elsewhere). The
// helpers here translate "days off" into "hours unavailable for project work"
// so that planning, forecasting and risk views can flag when planned work
// exceeds the *reduced* available capacity (not just the contractual one).
//
// IMPORTANT: per-user daily working hours are *not* hardcoded — they are
// pulled from each collaborator's HR profile (collaborators.daily_hours +
// days_per_week). Callers pass `dailyHours` explicitly so part-time and
// flexible-schedule users are reflected correctly across planning,
// forecasting and capacity reporting.

import { addDays, eachDayOfInterval, format, isWeekend, parseISO } from "date-fns";

/** Fallback only used when a resource has no HR profile linked. */
export const DEFAULT_DAILY_HOURS = 8;
/** Fallback only used when a resource has no HR profile linked. */
export const DEFAULT_DAYS_PER_WEEK = 5;

export interface LeaveInterval {
  start: Date;
  end: Date;
}

export interface ResourceLeave {
  resourceId: string;
  intervals: LeaveInterval[];
}

/**
 * Per-resource working schedule. Both fields come from the collaborator's
 * HR profile and feed every capacity / availability calculation.
 */
export interface ResourceSchedule {
  dailyHours: number;
  daysPerWeek: number;
}

/** True if `date` falls inside any of the leave intervals. */
export function isOnLeave(date: Date, intervals: LeaveInterval[]): boolean {
  for (const i of intervals) {
    if (date >= i.start && date <= i.end) return true;
  }
  return false;
}

/**
 * Working days in [start, end] inclusive that are NOT weekends and NOT public
 * holidays. This is the "raw" capacity denominator before subtracting leave.
 *
 * NOTE: weekends are treated as Sat/Sun for everyone — `daysPerWeek < 5`
 * (e.g. 4-day week) is reflected via `dailyHours` × `daysPerWeek` weekly
 * capacity, not by removing weekdays. This keeps allocation-overlap math
 * straightforward (allocations live on calendar weekdays).
 */
export function workingDaysInRange(
  start: Date,
  end: Date,
  holidays: Set<string> | undefined,
): number {
  if (start > end) return 0;
  let n = 0;
  for (const d of eachDayOfInterval({ start, end })) {
    if (isWeekend(d)) continue;
    if (holidays?.has(format(d, "yyyy-MM-dd"))) continue;
    n += 1;
  }
  return n;
}

/**
 * Hours of *leave* (approved vacation) that fall inside [start, end] for a
 * single resource — excluding weekends and public holidays (those days are
 * already non-working and would double-count). Each leave day is valued at
 * the resource's contractual `dailyHours` (so a part-time 4h/day user only
 * loses 4h per leave day, not 8h).
 */
export function leaveHoursInRange(
  start: Date,
  end: Date,
  intervals: LeaveInterval[],
  holidays: Set<string> | undefined,
  dailyHours: number = DEFAULT_DAILY_HOURS,
): number {
  if (!intervals.length || start > end) return 0;
  let h = 0;
  for (const d of eachDayOfInterval({ start, end })) {
    if (isWeekend(d)) continue;
    const iso = format(d, "yyyy-MM-dd");
    if (holidays?.has(iso)) continue;
    if (isOnLeave(d, intervals)) h += dailyHours;
  }
  return h;
}

export interface CapacitySummary {
  /** Working days in window minus public holidays. */
  workingDays: number;
  /** workingDays × dailyHours (resource-specific). */
  rawCapacityHours: number;
  /** Hours lost to approved leave inside the window. */
  leaveHours: number;
  /** rawCapacityHours − leaveHours, never below 0. */
  effectiveCapacityHours: number;
  /** leaveHours / rawCapacityHours, in %. */
  reductionPct: number;
  /** The dailyHours value used (echoed for tooltips / debugging). */
  dailyHours: number;
}

/**
 * Compute a single resource's effective capacity over [start, end] using its
 * own contractual daily working hours. `dailyHours` should be
 * `collaborators.daily_hours` (defaults to 8 if the resource is not linked
 * to a collaborator).
 */
export function computeResourceCapacity(
  start: Date,
  end: Date,
  intervals: LeaveInterval[],
  holidays: Set<string> | undefined,
  dailyHours: number = DEFAULT_DAILY_HOURS,
): CapacitySummary {
  const wd = workingDaysInRange(start, end, holidays);
  const raw = wd * dailyHours;
  const leave = leaveHoursInRange(start, end, intervals, holidays, dailyHours);
  const eff = Math.max(0, raw - leave);
  return {
    workingDays: wd,
    rawCapacityHours: raw,
    leaveHours: leave,
    effectiveCapacityHours: eff,
    reductionPct: raw > 0 ? (leave / raw) * 100 : 0,
    dailyHours,
  };
}

/**
 * Return the subset of dates in [start, end] (inclusive, weekdays only) where
 * a resource is on leave OR a public holiday applies. Used to mark "blocked"
 * cells on the Gantt and to count overload more precisely.
 */
export function unavailableDatesInRange(
  start: Date,
  end: Date,
  intervals: LeaveInterval[],
  holidays: Set<string> | undefined,
): Set<string> {
  const out = new Set<string>();
  if (start > end) return out;
  for (const d of eachDayOfInterval({ start, end })) {
    if (isWeekend(d)) continue;
    const iso = format(d, "yyyy-MM-dd");
    if (holidays?.has(iso)) {
      out.add(iso);
      continue;
    }
    if (isOnLeave(d, intervals)) out.add(iso);
  }
  return out;
}

/** Iterate all weekdays in [start, end]. Convenience wrapper. */
export function eachWeekday(start: Date, end: Date): Date[] {
  if (start > end) return [];
  const out: Date[] = [];
  let d = start;
  while (d <= end) {
    if (!isWeekend(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** Parse an ISO date string to a Date in local time (re-export for callers). */
export const parseDate = parseISO;
