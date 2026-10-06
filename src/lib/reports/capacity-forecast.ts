/**
 * "Capacity forecast" report — pure calculation (no Supabase calls).
 *
 * Available hours per person-week come from computeHoursLogged (same
 * expected-hours rule as Hours logged: admission date, part-time, holidays,
 * approved leave). Planned hours come from pm_allocations on own (is_self)
 * active/planned stages. Unassigned demand comes from
 * pm_stage_allocation_placeholders, spread over the stage's working days.
 */
import { round2 } from "@/lib/projects/use-timesheet-weeks";
import { estimateStageLoad, isImplicitAllocation, stagePlannedHours, type StageLoadEstimate } from "@/lib/projects/stage-load-estimate";
import { addDays, computeHoursLogged, weeksInRange, type NonWorkingDay, type RosterPerson } from "./hours-logged";

export type CfAllocation = {
  resource_id: string;
  stage_id: string;
  start_date: string;
  end_date: string;
  hours_per_day: number | null;
  allocation_percentage: number | null;
};
export type CfStage = {
  id: string;
  project_id: string;
  label: string;
  projectLabel: string;
  start_date: string | null;
  end_date: string | null;
  budget?: number | null;
};
export type CfPlaceholder = { project_stage_id: string; expected_hours: number | null };

export type CfItem = { stageId: string; projectId: string; projectLabel: string; stageLabel: string; hours: number; estimated: boolean };
export type CfCell = { weekStart: string; available: number; planned: number; estimated: number; load: number | null; items: CfItem[] };
export type CfPersonRow = { person: RosterPerson; weeks: CfCell[]; available: number; planned: number; estimated: number };
export type CfTeamWeek = { weekStart: string; available: number; planned: number; estimated: number; unassigned: number; load: number | null };
export type CfNoPlanStage = { stageId: string; projectId: string; projectLabel: string; stageLabel: string };

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export type LoadBand = "low" | "ok" | "high" | "over";
export function bandFor(load: number | null): LoadBand | null {
  if (load == null) return null;
  if (load < 0.5) return "low";
  if (load <= 0.9) return "ok";
  if (load <= 1.1) return "high";
  return "over";
}

const isWeekday = (iso: string) => {
  const d = new Date(iso + "T00:00:00").getDay();
  return d !== 0 && d !== 6;
};

export function computeCapacityForecast(input: {
  rangeStart: string;
  rangeEnd: string;
  roster: RosterPerson[];
  nonWorking: NonWorkingDay[];
  holidays: string[];
  allocations: CfAllocation[];
  stages: Map<string, CfStage>;
  placeholders: CfPlaceholder[];
  /** Hours already logged per stage (all people), for the estimate. */
  loggedByStage?: Map<string, number>;
  avgSaleRate?: number;
  today?: string;
  /** "Só horas explícitas": skip estimates. */
  explicitOnly?: boolean;
}): { people: CfPersonRow[]; team: CfTeamWeek[]; noPlan: CfNoPlanStage[] } {
  const { rangeStart, rangeEnd, roster, stages } = input;
  const weeks = weeksInRange(rangeStart, rangeEnd);
  const expected = computeHoursLogged({ rangeStart, rangeEnd, roster, entries: [], weekRows: [], nonWorking: input.nonWorking });
  const nwByUser = new Map<string, Set<string>>();
  for (const n of input.nonWorking) {
    if (["Authorized (unpaid)", "Medical appointment (unpaid)"].includes((n as { leave_type?: string }).leave_type ?? "")) continue;
    const s = nwByUser.get(n.user_id) ?? new Set<string>();
    s.add(n.entry_date);
    nwByUser.set(n.user_id, s);
  }
  const allocByRes = new Map<string, CfAllocation[]>();
  for (const a of input.allocations) {
    if (!stages.has(a.stage_id)) continue;
    allocByRes.set(a.resource_id, [...(allocByRes.get(a.resource_id) ?? []), a]);
  }

  // Estimates for assignments without hours (hours_per_day = 0, no %).
  const hol = new Set(input.holidays);
  const today = input.today ?? todayISO();
  const allocByStage = new Map<string, CfAllocation[]>();
  for (const a of input.allocations) if (stages.has(a.stage_id)) allocByStage.set(a.stage_id, [...(allocByStage.get(a.stage_id) ?? []), a]);
  const estimates = new Map<string, StageLoadEstimate & { daySet: Set<string> }>();
  const noPlan: CfNoPlanStage[] = [];
  for (const [sid, list] of allocByStage) {
    const implicitInRange = list.some((a) => isImplicitAllocation(a) && a.start_date <= rangeEnd && a.end_date >= rangeStart);
    if (!implicitInRange) continue;
    const s = stages.get(sid)!;
    const est = estimateStageLoad({
      stageId: sid,
      planned: stagePlannedHours({ allocations: list, budget: s.budget ?? null, avgSaleRate: input.avgSaleRate ?? 0 }),
      logged: input.loggedByStage?.get(sid) ?? 0,
      start: s.start_date, end: s.end_date, today, holidays: hol, allocations: list,
    });
    if (!est) noPlan.push({ stageId: sid, projectId: s.project_id, projectLabel: s.projectLabel, stageLabel: s.label });
    else estimates.set(sid, { ...est, daySet: new Set(est.days) });
  }

  const people: CfPersonRow[] = expected.map((row) => {
    const p = row.person;
    const nw = nwByUser.get(p.userId) ?? new Set<string>();
    const daily = Number(p.dailyHours) || 8;
    const mine = p.resourceId ? allocByRes.get(p.resourceId) ?? [] : [];
    const cells: CfCell[] = row.weeks.map((w) => {
      const byStage = new Map<string, number>();
      const estByStage = new Map<string, number>();
      for (const a of mine) {
        const implicit = isImplicitAllocation(a);
        const est = implicit && !input.explicitOnly ? estimates.get(a.stage_id) : undefined;
        if (implicit && !est) continue;
        let days = 0;
        for (let i = 0; i < 5; i++) {
          const d = addDays(w.weekStart, i);
          if (d < rangeStart || d > rangeEnd || d < a.start_date || d > a.end_date) continue;
          if (p.startDate && d < p.startDate) continue;
          if (nw.has(d)) continue;
          if (est && !est.daySet.has(d)) continue;
          days++;
        }
        if (!days) continue;
        if (est) {
          estByStage.set(a.stage_id, (estByStage.get(a.stage_id) ?? 0) + est.perPersonDay * days);
          continue;
        }
        const hpd = Number(a.hours_per_day) || 0;
        const h = hpd > 0 ? hpd * days : ((Number(a.allocation_percentage) || 0) / 100) * daily * days;
        if (h > 0) byStage.set(a.stage_id, (byStage.get(a.stage_id) ?? 0) + h);
      }
      const mk = (sid: string, h: number, estimated: boolean): CfItem => {
        const s = stages.get(sid)!;
        return { stageId: sid, projectId: s.project_id, projectLabel: s.projectLabel, stageLabel: s.label, hours: round2(h), estimated };
      };
      const items: CfItem[] = [
        ...[...byStage].map(([sid, h]) => mk(sid, h, false)),
        ...[...estByStage].filter(([, h]) => h > 0).map(([sid, h]) => mk(sid, h, true)),
      ].sort((x, y) => y.hours - x.hours);
      const planned = round2(items.reduce((s, i) => s + i.hours, 0));
      const estimated = round2(items.filter((i) => i.estimated).reduce((s, i) => s + i.hours, 0));
      return { weekStart: w.weekStart, available: w.expected, planned, estimated, load: w.expected > 0 ? planned / w.expected : null, items };
    });
    return {
      person: p,
      weeks: cells,
      available: round2(cells.reduce((s, c) => s + c.available, 0)),
      planned: round2(cells.reduce((s, c) => s + c.planned, 0)),
      estimated: round2(cells.reduce((s, c) => s + c.estimated, 0)),
    };
  });

  // Unassigned demand: placeholder hours spread evenly over the stage's working days.
  const unassigned = new Map<string, number>();
  for (const ph of input.placeholders) {
    const s = stages.get(ph.project_stage_id);
    const total = Number(ph.expected_hours) || 0;
    if (!s || !s.start_date || !s.end_date || total <= 0) continue;
    const days: string[] = [];
    for (let d = s.start_date; d <= s.end_date; d = addDays(d, 1)) if (isWeekday(d) && !hol.has(d)) days.push(d);
    if (!days.length) continue;
    const per = total / days.length;
    for (const d of days) {
      if (d < rangeStart || d > rangeEnd) continue;
      const wk = weeks.find((w) => d >= w.weekStart && d <= w.weekEnd);
      if (wk) unassigned.set(wk.weekStart, (unassigned.get(wk.weekStart) ?? 0) + per);
    }
  }

  const team: CfTeamWeek[] = weeks.map((w, i) => {
    const available = round2(people.reduce((s, r) => s + r.weeks[i].available, 0));
    const planned = round2(people.reduce((s, r) => s + r.weeks[i].planned, 0));
    const estimated = round2(people.reduce((s, r) => s + r.weeks[i].estimated, 0));
    return { weekStart: w.weekStart, available, planned, estimated, unassigned: round2(unassigned.get(w.weekStart) ?? 0), load: available > 0 ? planned / available : null };
  });
  return { people, team, noPlan: noPlan.sort((a, b) => a.projectLabel.localeCompare(b.projectLabel)) };
}
