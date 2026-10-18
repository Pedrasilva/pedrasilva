/**
 * Team performance drill-down — pure calculations (no database calls).
 *
 * Net capacity = working weekdays × daily hours − public holidays − office
 * closures − approved leave, up to a cutoff (today by default). Utilization
 * = logged hours ÷ net capacity. Leave comes from the person's synced
 * non_working timesheet entries; unpaid leave is time owed and does not
 * reduce capacity (same rule as the Hours logged report).
 */

export type CalendarDay = { date: string; name: string; closure: boolean };
export type LeaveEntry = { entry_date: string; hours: number; leave_type?: string | null };

export const UNPAID_LEAVE_TYPES = ["Authorized (unpaid)", "Medical appointment (unpaid)"];

const parse = (iso: string) => new Date(iso + "T00:00:00");
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function weekdaysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = parse(start); iso(d) <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(iso(d));
  }
  return out;
}

/** End of the compared range: today (clamped into the period) or the period end. */
export function capacityCutoff(periodStart: string, periodEnd: string, today: string, untilToday: boolean): string {
  if (!untilToday) return periodEnd;
  if (today < periodStart) return periodStart;
  return today < periodEnd ? today : periodEnd;
}

export interface CapacityBreakdown {
  weekdays: number;
  dailyHours: number;
  gross: number;
  holidays: { date: string; name: string; hours: number }[];
  closures: { date: string; name: string; hours: number }[];
  leave: { date: string; type: string; hours: number }[];
  net: number;
  /** Working days left after holidays, closures and full-day leave. */
  workingDays: string[];
}

export function computeCapacity(input: {
  start: string;
  end: string;
  dailyHours: number;
  calendar: CalendarDay[];
  leaveEntries: LeaveEntry[];
}): CapacityBreakdown {
  const daily = input.dailyHours > 0 ? input.dailyHours : 8;
  const days = weekdaysBetween(input.start, input.end);
  const cal = new Map(input.calendar.map((c) => [c.date, c]));
  const leaveByDay = new Map<string, { hours: number; type: string }>();
  for (const e of input.leaveEntries) {
    if (UNPAID_LEAVE_TYPES.includes(e.leave_type ?? "")) continue;
    const cur = leaveByDay.get(e.entry_date) ?? { hours: 0, type: e.leave_type ?? "" };
    cur.hours += Number(e.hours) || 0;
    leaveByDay.set(e.entry_date, cur);
  }
  const out: CapacityBreakdown = {
    weekdays: days.length,
    dailyHours: daily,
    gross: r2(days.length * daily),
    holidays: [],
    closures: [],
    leave: [],
    net: 0,
    workingDays: [],
  };
  let deducted = 0;
  for (const d of days) {
    const c = cal.get(d);
    if (c) {
      (c.closure ? out.closures : out.holidays).push({ date: d, name: c.name, hours: daily });
      deducted += daily;
      continue;
    }
    const l = leaveByDay.get(d);
    if (l && l.hours > 0) {
      const h = Math.min(l.hours, daily);
      out.leave.push({ date: d, type: l.type, hours: r2(h) });
      deducted += h;
      if (h < daily) out.workingDays.push(d);
      continue;
    }
    out.workingDays.push(d);
  }
  out.net = r2(Math.max(0, out.gross - deducted));
  return out;
}

export type DrillEntry = {
  entry_date: string;
  hours: number;
  billable: boolean;
  entry_type: "project" | "internal" | "non_working";
  internal_category?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  stageId?: string | null;
  stageLabel?: string | null;
};

export interface BreakdownLine {
  key: string;
  kind: "project" | "internal";
  label: string;
  projectId: string | null;
  hours: number;
  pct: number;
  billable: boolean;
  stages: { key: string; label: string; hours: number; pct: number; billable: boolean }[];
}

/** Logged work (no leave) grouped by project → stage and internal category, sorted by hours. */
export function breakdownLogged(entries: DrillEntry[], labels: { noStage: string; uncategorised: string; unknownProject: string }): {
  total: number;
  lines: BreakdownLine[];
} {
  const work = entries.filter((e) => e.entry_type !== "non_working");
  const total = r2(work.reduce((s, e) => s + (Number(e.hours) || 0), 0));
  const pct = (h: number) => (total > 0 ? h / total : 0);
  const map = new Map<string, BreakdownLine & { stageMap: Map<string, { label: string; hours: number; billableHours: number }> ; billableHours: number }>();
  for (const e of work) {
    const h = Number(e.hours) || 0;
    const isProject = e.entry_type === "project" && !!e.projectId;
    const key = isProject ? `p:${e.projectId}` : `i:${e.internal_category ?? (e.entry_type === "project" ? labels.unknownProject : labels.uncategorised)}`;
    let line = map.get(key);
    if (!line) {
      line = {
        key,
        kind: isProject ? "project" : "internal",
        label: isProject ? e.projectName ?? labels.unknownProject : e.internal_category ?? (e.entry_type === "project" ? labels.unknownProject : labels.uncategorised),
        projectId: isProject ? e.projectId ?? null : null,
        hours: 0,
        pct: 0,
        billable: false,
        stages: [],
        stageMap: new Map(),
        billableHours: 0,
      };
      map.set(key, line);
    }
    const billable = e.entry_type === "project" && e.billable;
    line.hours += h;
    if (billable) line.billableHours += h;
    if (isProject) {
      const sk = e.stageId ?? "none";
      const st = line.stageMap.get(sk) ?? { label: e.stageLabel ?? labels.noStage, hours: 0, billableHours: 0 };
      st.hours += h;
      if (billable) st.billableHours += h;
      line.stageMap.set(sk, st);
    }
  }
  const lines: BreakdownLine[] = [...map.values()].map(({ stageMap, billableHours, ...l }) => ({
    ...l,
    hours: r2(l.hours),
    pct: pct(l.hours),
    billable: billableHours > l.hours / 2,
    stages: [...stageMap.entries()]
      .map(([k, s]) => ({ key: k, label: s.label, hours: r2(s.hours), pct: pct(s.hours), billable: s.billableHours > s.hours / 2 }))
      .sort((a, b) => b.hours - a.hours),
  }));
  lines.sort((a, b) => b.hours - a.hours);
  return { total, lines };
}

const mondayOf = (d: string) => {
  const x = parse(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return iso(x);
};

/** Logged work hours per Monday-start week overlapping [start, end]. */
export function hoursPerWeek(entries: DrillEntry[], start: string, end: string): { weekStart: string; hours: number }[] {
  const out: { weekStart: string; hours: number }[] = [];
  for (let w = mondayOf(start); w <= end; ) {
    out.push({ weekStart: w, hours: 0 });
    const n = parse(w);
    n.setDate(n.getDate() + 7);
    w = iso(n);
  }
  const idx = new Map(out.map((w, i) => [w.weekStart, i]));
  for (const e of entries) {
    if (e.entry_type === "non_working" || e.entry_date < start || e.entry_date > end) continue;
    const i = idx.get(mondayOf(e.entry_date));
    if (i !== undefined) out[i].hours += Number(e.hours) || 0;
  }
  return out.map((w) => ({ ...w, hours: r2(w.hours) }));
}

/** Working days (after holidays, closures and full-day leave) with no work logged. */
export function daysWithoutHours(workingDays: string[], entries: DrillEntry[]): string[] {
  const logged = new Set(entries.filter((e) => e.entry_type !== "non_working" && Number(e.hours) > 0).map((e) => e.entry_date));
  return workingDays.filter((d) => !logged.has(d));
}
