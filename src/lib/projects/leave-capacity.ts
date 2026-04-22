// Utilities for computing how approved leave / public holidays reduce a
// resource's *delivery* capacity over a date window.
//
// Leave still appears as company COST in financials (handled elsewhere). The
// helpers here translate "days off" into "hours unavailable for project work"
// so that planning, forecasting and risk views can flag when planned work
// exceeds the *reduced* available capacity (not just the contractual one).

import { addDays, eachDayOfInterval, format, isWeekend, parseISO } from "date-fns";

export const STANDARD_DAILY_HOURS = 8;

export interface LeaveInterval {
  start: Date;
  end: Date;
}

export interface ResourceLeave {
  resourceId: string;
  intervals: LeaveInterval[];
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
 * STANDARD_DAILY_HOURS.
 */
export function leaveHoursInRange(
  start: Date,
  end: Date,
  intervals: LeaveInterval[],
  holidays: Set<string> | undefined,
): number {
  if (!intervals.length || start > end) return 0;
  let h = 0;
  for (const d of eachDayOfInterval({ start, end })) {
    if (isWeekend(d)) continue;
    const iso = format(d, "yyyy-MM-dd");
    if (holidays?.has(iso)) continue;
    if (isOnLeave(d, intervals)) h += STANDARD_DAILY_HOURS;
  }
  return h;
}

export interface CapacitySummary {
  /** Working days in window minus public holidays. */
  workingDays: number;
  /** workingDays × STANDARD_DAILY_HOURS. */
  rawCapacityHours: number;
  /** Hours lost to approved leave inside the window. */
  leaveHours: number;
  /** rawCapacityHours − leaveHours, never below 0. */
  effectiveCapacityHours: number;
  /** leaveHours / rawCapacityHours, in %. */
  reductionPct: number;
}

/** Compute a single resource's effective capacity over [start, end]. */
export function computeResourceCapacity(
  start: Date,
  end: Date,
  intervals: LeaveInterval[],
  holidays: Set<string> | undefined,
): CapacitySummary {
  const wd = workingDaysInRange(start, end, holidays);
  const raw = wd * STANDARD_DAILY_HOURS;
  const leave = leaveHoursInRange(start, end, intervals, holidays);
  const eff = Math.max(0, raw - leave);
  return {
    workingDays: wd,
    rawCapacityHours: raw,
    leaveHours: leave,
    effectiveCapacityHours: eff,
    reductionPct: raw > 0 ? (leave / raw) * 100 : 0,
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
