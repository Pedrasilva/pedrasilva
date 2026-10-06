/**
 * "Saúde da empresa" — pure calculation (no Supabase calls).
 *
 * Reuses: computeHoursLogged (available = expected hours), billable-split
 * (kinds of time, weighted target), entryFigures from business-performance
 * (value of work = billable hours × sale rate; cost = locked snapshot).
 * Full studio cost comes from the server (company-health.functions.ts).
 *
 * Waterfall: project-team hours are valued at their locked cost rate
 * (billable, non-billable, internal by category, unlogged, paid leave and
 * holidays); "estrutura" = full cost − those blocks (back office salaries,
 * operating costs not absorbed by the rates).
 */
import { computeHoursLogged, effectiveStart, addDays, mondayOf, type RosterPerson } from "./hours-logged";
import { entryFigures, type BPRates } from "./business-performance";
import { addEntry, emptySplit, weightedTarget, type Split, type SplitEntry } from "./billable-split";

export interface HealthEntry extends SplitEntry {
  opportunity_id: string | null;
  leave_type: string | null;
  non_working_day_reason: string | null;
  approval_status: string | null;
  cost_rate_source?: string | null;
}
export interface LeaveDay {
  user_id: string;
  entry_date: string;
  leave_type: string;
  source_kind: "vacation" | "holiday";
}
export interface HealthInput {
  start: string;
  end: string;
  roster: RosterPerson[];
  entries: HealthEntry[];
  leaveDays: LeaveDay[];
  holidays: Set<string>;
  fullCost: number;
  targetOf: (p: RosterPerson) => number | null;
  isBackOffice: (p: RosterPerson) => boolean;
  ratesFor: (e: HealthEntry) => BPRates;
  /** Locked cost €/h for a resource on a date (pm_cost_rate_periods). */
  costRateAt: (resourceId: string | null | undefined, date: string) => number;
  projectOf: (e: HealthEntry) => string | null;
  isOwnWork: (e: HealthEntry) => boolean;
  lostLeads: Set<string>;
}

export const UNPAID = "Authorized (unpaid)";
export const VACATION = "Vacation";
const isWeekend = (d: string) => {
  const w = new Date(d + "T00:00:00").getDay();
  return w === 0 || w === 6;
};

export interface Health {
  days: { total: number; weekends: number; holidays: number; working: number };
  personDays: { gross: number; vacation: number; otherPaid: number; unpaid: number; available: number; people: number };
  hours: { available: number; logged: number; unlogged: number; unloggedPct: number | null; split: Split; internalByCategory: { category: string; hours: number; cost: number }[] };
  chargeability: { team: number | null; target: number | null; studio: number | null; ofAvailable: number | null; breakEven: number | null };
  money: {
    value: number;
    fullCost: number;
    result: number;
    marginPct: number | null;
    avgSaleRate: number | null;
    blocks: { billable: number; nonBillable: number; internal: number; unlogged: number; leave: number; estrutura: number };
  };
  losses: { projects: { projectId: string; value: number; cost: number; hours: number }[]; pursuitLost: number };
  /** Per-person breakdown of each "where we lose money" row (keys: i:<cat>, unlogged, nonBillable, pursuitLost). */
  lossPeople: Record<string, LossPerson[]>;
}

export interface LossPerson {
  userId: string;
  name: string;
  hours: number;
  cost: number;
  /** Hours costed in "estrutura" (back office / overhead rate): € shown as included in structure. */
  overhead: boolean;
  /** Only for "unlogged": share of expected hours not logged. */
  pctNotLogged?: number | null;
  weeks: { weekStart: string; hours: number; cost: number }[];
}

export function computeCompanyHealth(i: HealthInput): Health {
  const { start, end } = i;
  const entries = i.entries.filter((e) => e.entry_date >= start && e.entry_date <= end);
  const users = new Set(i.roster.map((p) => p.userId));

  // 1. Days (calendar)
  let total = 0, weekends = 0, hol = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    total++;
    if (isWeekend(d)) weekends++;
    else if (i.holidays.has(d)) hol++;
  }
  const working = total - weekends - hol;

  // Person-days: working days from each person's effective start, capped by days/week.
  const leaveBy = new Map<string, Map<string, string>>();
  for (const l of i.leaveDays) {
    if (l.source_kind !== "vacation" || l.entry_date < start || l.entry_date > end) continue;
    const m = leaveBy.get(l.user_id) ?? new Map<string, string>();
    m.set(l.entry_date, l.leave_type);
    leaveBy.set(l.user_id, m);
  }
  const pd = { gross: 0, vacation: 0, otherPaid: 0, unpaid: 0, available: 0, people: 0 };
  const paidLeaveDays = new Map<string, { leave: number; holiday: number }>();
  for (const p of i.roster) {
    const from = effectiveStart(start, p.startDate);
    const cap = Number(p.daysPerWeek) || 5;
    const lv = leaveBy.get(p.userId);
    let gross = 0, weekCount = 0, holDays = 0, paid = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (new Date(d + "T00:00:00").getDay() === 1) weekCount = 0;
      if (d < from || isWeekend(d)) continue;
      if (i.holidays.has(d)) { holDays++; continue; }
      if (weekCount >= cap) continue;
      weekCount++;
      gross++;
      const t = lv?.get(d);
      if (t === UNPAID || t === "Medical appointment (unpaid)") pd.unpaid++;
      else if (t === VACATION) { pd.vacation++; paid++; }
      else if (t) { pd.otherPaid++; paid++; }
    }
    if (gross > 0) pd.people++;
    pd.gross += gross;
    paidLeaveDays.set(p.userId, { leave: paid, holiday: holDays });
  }
  pd.available = pd.gross - pd.vacation - pd.otherPaid;

  // 2. Hours — available = Hours logged expected hours.
  const rows = computeHoursLogged({
    rangeStart: start,
    rangeEnd: end,
    roster: i.roster,
    entries: entries as never,
    weekRows: [],
    nonWorking: i.leaveDays as never,
  });
  const split = emptySplit();
  const byUser = new Map<string, Split>();
  const cat = new Map<string, { hours: number; cost: number }>();
  const bo = new Map(i.roster.map((p) => [p.userId, i.isBackOffice(p)]));
  const blocks = { billable: 0, nonBillable: 0, internal: 0, unlogged: 0, leave: 0, estrutura: 0 };
  let value = 0, billableHours = 0, pursuitLost = 0;
  const proj = new Map<string, { projectId: string; value: number; cost: number; hours: number }>();
  const nameOf = new Map(i.roster.map((p) => [p.userId, p.name]));
  const lp = new Map<string, Map<string, LossPerson & { wk: Map<string, { hours: number; cost: number }> }>>();
  const addLoss = (key: string, userId: string, hours: number, cost: number, week: string, overhead: boolean, pctNotLogged?: number | null) => {
    const m = lp.get(key) ?? new Map();
    lp.set(key, m);
    const r = m.get(userId) ?? { userId, name: nameOf.get(userId) ?? "—", hours: 0, cost: 0, overhead: true, weeks: [], wk: new Map() };
    r.hours += hours;
    r.cost += overhead ? 0 : cost;
    if (!overhead) r.overhead = false;
    if (pctNotLogged !== undefined) r.pctNotLogged = pctNotLogged;
    const w = r.wk.get(week) ?? { hours: 0, cost: 0 };
    w.hours += hours;
    w.cost += overhead ? 0 : cost;
    r.wk.set(week, w);
    m.set(userId, r);
  };
  for (const e of entries) {
    if (!users.has(e.user_id)) continue;
    addEntry(split, e);
    const s = byUser.get(e.user_id) ?? emptySplit();
    addEntry(s, e);
    byUser.set(e.user_id, s);
    const f = entryFigures(e, i.ratesFor(e));
    if (!f) continue;
    value += f.revenue;
    billableHours += f.billableHours;
    const ovh = !!bo.get(e.user_id) || e.cost_rate_source === "overhead";
    const wk = mondayOf(e.entry_date);
    if (e.entry_type === "internal" && e.opportunity_id && i.lostLeads.has(e.opportunity_id)) {
      pursuitLost += f.cost;
      addLoss("pursuitLost", e.user_id, f.hours, f.cost, wk, false);
    }
    if (e.entry_type === "project" && f.billableHours <= 0) addLoss("nonBillable", e.user_id, f.hours, f.cost, wk, ovh);
    if (e.entry_type === "project" && i.isOwnWork(e)) {
      const pid = i.projectOf(e);
      if (pid) {
        const r = proj.get(pid) ?? { projectId: pid, value: 0, cost: 0, hours: 0 };
        r.value += f.revenue;
        r.cost += f.cost;
        r.hours += f.hours;
        proj.set(pid, r);
      }
    }
    if (e.entry_type === "internal") {
      const k = e.internal_category?.trim() || "—";
      const c = cat.get(k) ?? { hours: 0, cost: 0 };
      c.hours += f.hours;
      if (!bo.get(e.user_id)) c.cost += f.cost;
      cat.set(k, c);
      addLoss(`i:${k}`, e.user_id, f.hours, f.cost, wk, ovh);
    }
    if (bo.get(e.user_id)) continue;
    if (f.billableHours > 0) blocks.billable += f.cost;
    else if (e.entry_type === "project") blocks.nonBillable += f.cost;
    else blocks.internal += f.cost;
  }
  let available = 0, unlogged = 0, teamAvail = 0;
  for (const r of rows) {
    available += r.expected;
    const gap = Math.max(0, r.gap);
    unlogged += gap;
    const p = r.person;
    if ((i.targetOf(p) ?? 0) > 0) teamAvail += r.expected;
    const rate = i.costRateAt(p.resourceId, end);
    const isBo = !!bo.get(p.userId);
    if (gap > 0) {
      const pct = r.expected > 0 ? (gap / r.expected) * 100 : null;
      for (const w of r.weeks) {
        const wg = Math.max(0, w.expected - w.logged);
        if (wg > 0) addLoss("unlogged", p.userId, wg, wg * rate, w.weekStart, isBo, pct);
      }
      // Keep the person's total equal to their period gap (same rule as Hours logged).
      const row = lp.get("unlogged")?.get(p.userId);
      if (row) { row.hours = gap; row.cost = isBo ? 0 : gap * rate; }
      else addLoss("unlogged", p.userId, gap, gap * rate, mondayOf(end), isBo, pct);
    }
    if (isBo) continue;
    blocks.unlogged += gap * rate;
    const lv = paidLeaveDays.get(p.userId);
    const daily = Number(p.dailyHours) || 8;
    if (lv) blocks.leave += (lv.leave + lv.holiday) * daily * rate;
  }
  blocks.estrutura = i.fullCost - blocks.billable - blocks.nonBillable - blocks.internal - blocks.unlogged - blocks.leave;

  // Chargeability, like with like (project team = target > 0).
  const team = i.roster.filter((p) => (i.targetOf(p) ?? 0) > 0);
  const tLogged = team.reduce((a, p) => a + (byUser.get(p.userId)?.logged ?? 0), 0);
  const tBill = team.reduce((a, p) => a + (byUser.get(p.userId)?.billable ?? 0), 0);
  const target = weightedTarget(team.map((p) => ({ logged: byUser.get(p.userId)?.logged ?? 0, targetPct: i.targetOf(p) })));
  const avgSaleRate = billableHours > 0 ? value / billableHours : null;
  const breakEven = avgSaleRate && teamAvail > 0 ? (i.fullCost / avgSaleRate / teamAvail) * 100 : null;

  const result = value - i.fullCost;
  return {
    days: { total, weekends, holidays: hol, working },
    personDays: pd,
    hours: {
      available,
      logged: split.logged,
      unlogged,
      unloggedPct: available > 0 ? (unlogged / available) * 100 : null,
      split,
      internalByCategory: [...cat.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.hours - a.hours),
    },
    chargeability: {
      team: tLogged > 0 ? (tBill / tLogged) * 100 : null,
      target,
      studio: split.logged > 0 ? (split.billable / split.logged) * 100 : null,
      ofAvailable: teamAvail > 0 ? (tBill / teamAvail) * 100 : null,
      breakEven,
    },
    money: { value, fullCost: i.fullCost, result, marginPct: value > 0 ? (result / value) * 100 : null, avgSaleRate, blocks },
    lossPeople: Object.fromEntries(
      [...lp.entries()].map(([k, m]) => [
        k,
        [...m.values()]
          .map(({ wk, ...r }) => ({ ...r, weeks: [...wk.entries()].map(([weekStart, v]) => ({ weekStart, ...v })).sort((a, b) => a.weekStart.localeCompare(b.weekStart)) }))
          .filter((r) => r.hours > 0.001)
          .sort((a, b) => b.hours - a.hours),
      ]),
    ),
    losses: { projects: [...proj.values()].filter((p) => p.cost > p.value).sort((a, b) => b.cost - b.value - (a.cost - a.value)), pursuitLost },
  };
}

/** Calendar months overlapping [start, end], clipped to the range. */
export function monthsIn(start: string, end: string): { key: string; start: string; end: string }[] {
  const out: { key: string; start: string; end: string }[] = [];
  let d = start;
  while (d <= end) {
    const key = d.slice(0, 7);
    const [y, m] = key.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const e = last < end ? last : end;
    out.push({ key, start: d, end: e });
    d = addDays(e, 1);
  }
  return out;
}
