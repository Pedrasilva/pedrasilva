/**
 * "Hours logged" report — pure calculation (no Supabase calls).
 *
 * Callers fetch the roster, entries, week records and the non-working
 * expansion (expandNonWorkingForRange) and hand them in. Reused later by the
 * productivity report.
 */
import { toLocalISODate } from "@/lib/dates";
import {
  totalsFromEntries,
  round2,
  DEFAULT_DAILY_HOURS,
  DEFAULT_DAYS_PER_WEEK,
} from "@/lib/projects/use-timesheet-weeks";

export type HoursStatus = "onTrack" | "behind" | "farBehind";

export type RosterPerson = {
  userId: string;
  collaboratorId: string;
  name: string;
  department: string | null;
  team: string | null;
  dailyHours: number | null;
  daysPerWeek: number | null;
  /** Optional start date (yyyy-mm-dd); no hours are expected before it. */
  startDate?: string | null;
};

export type ReportEntry = { user_id: string; entry_date: string; entry_type: string; hours: number };
export type ReportWeekRow = { user_id: string; week_start: string; status: string };
export type NonWorkingDay = { user_id: string; entry_date: string };

export type WeekBreakdown = {
  weekStart: string;
  weekEnd: string;
  expected: number;
  logged: number;
  leave: number;
  status: string; // open | submitted | returned | approved | not_submitted
};

export type HoursLoggedRow = {
  person: RosterPerson;
  expected: number;
  logged: number;
  leave: number;
  gap: number;
  pct: number | null; // 0..1+, null when nothing expected
  weeksNotSubmitted: number;
  lastEntryDate: string | null;
  status: HoursStatus;
  weeks: WeekBreakdown[];
};

export const ON_TRACK_PCT = 0.95;
export const BEHIND_PCT = 0.5;

export function statusFor(pct: number | null): HoursStatus {
  if (pct === null || pct >= ON_TRACK_PCT) return "onTrack";
  if (pct >= BEHIND_PCT) return "behind";
  return "farBehind";
}

const parse = (iso: string) => new Date(iso + "T00:00:00");

/** Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const d = parse(iso);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toLocalISODate(d);
}

export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return toLocalISODate(d);
}

/** Monday-start weeks overlapping [start, end]. */
export function weeksInRange(start: string, end: string): { weekStart: string; weekEnd: string }[] {
  const out: { weekStart: string; weekEnd: string }[] = [];
  for (let w = mondayOf(start); w <= end; w = addDays(w, 7)) {
    out.push({ weekStart: w, weekEnd: addDays(w, 6) });
  }
  return out;
}

export function computeHoursLogged(input: {
  rangeStart: string;
  rangeEnd: string;
  roster: RosterPerson[];
  entries: ReportEntry[];
  weekRows: ReportWeekRow[];
  nonWorking: NonWorkingDay[];
}): HoursLoggedRow[] {
  const { rangeStart, rangeEnd, roster } = input;
  const weeks = weeksInRange(rangeStart, rangeEnd);

  const nwByUser = new Map<string, Set<string>>();
  for (const n of input.nonWorking) {
    const s = nwByUser.get(n.user_id) ?? new Set<string>();
    s.add(n.entry_date);
    nwByUser.set(n.user_id, s);
  }
  const entriesByUser = new Map<string, ReportEntry[]>();
  for (const e of input.entries) {
    if (e.entry_date < rangeStart || e.entry_date > rangeEnd) continue;
    const l = entriesByUser.get(e.user_id) ?? [];
    l.push(e);
    entriesByUser.set(e.user_id, l);
  }
  const weekStatus = new Map<string, string>();
  for (const w of input.weekRows) weekStatus.set(`${w.user_id}|${w.week_start}`, w.status);

  return roster.map((person) => {
    const daily = Number(person.dailyHours) || DEFAULT_DAILY_HOURS;
    const cap = Number(person.daysPerWeek) || DEFAULT_DAYS_PER_WEEK;
    const nw = nwByUser.get(person.userId) ?? new Set<string>();
    const mine = entriesByUser.get(person.userId) ?? [];
    const from = person.startDate && person.startDate > rangeStart ? person.startDate : rangeStart;

    let lastEntryDate: string | null = null;
    for (const e of mine) {
      if (e.entry_type !== "project" && e.entry_type !== "internal") continue;
      if (!lastEntryDate || e.entry_date > lastEntryDate) lastEntryDate = e.entry_date;
    }

    const weekRows: WeekBreakdown[] = weeks.map(({ weekStart, weekEnd }) => {
      // Working weekdays of this week inside the period, not holiday/leave.
      let available = 0;
      for (let i = 0; i < 5; i++) {
        const day = addDays(weekStart, i);
        if (day < from || day > rangeEnd) continue;
        if (nw.has(day)) continue;
        available++;
      }
      const expected = round2(Math.min(available, cap) * daily);
      const t = totalsFromEntries(
        mine.filter((e) => e.entry_date >= weekStart && e.entry_date <= weekEnd),
      );
      return {
        weekStart,
        weekEnd,
        expected,
        logged: round2(t.working),
        leave: round2(t.leave),
        status: weekStatus.get(`${person.userId}|${weekStart}`) ?? "not_submitted",
      };
    });

    const expected = round2(weekRows.reduce((s, w) => s + w.expected, 0));
    const logged = round2(weekRows.reduce((s, w) => s + w.logged, 0));
    const leave = round2(weekRows.reduce((s, w) => s + w.leave, 0));
    const pct = expected > 0 ? logged / expected : null;
    return {
      person,
      expected,
      logged,
      leave,
      gap: round2(expected - logged),
      pct,
      weeksNotSubmitted: weekRows.filter(
        (w) => w.weekEnd >= from && w.status !== "submitted" && w.status !== "approved",
      ).length,
      lastEntryDate,
      status: statusFor(pct),
      weeks: weekRows,
    };
  });
}
