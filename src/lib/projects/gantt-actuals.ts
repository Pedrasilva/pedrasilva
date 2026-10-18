import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { workingDays } from "./gantt-utils";
import { scheduleElapsedPct } from "../reports/budget-consumption";

export interface ActualActivity {
  id: string;
  stageId: string | null;
  personId: string;
  name: string;
  resourceId: string | null;
  date: string;
  hours: number;
  cost: number | null;
  imported?: boolean;
}
export interface ActualPlan {
  id: string;
  resourceId: string;
  start: string;
  end: string;
  hoursPerDay: number;
  percentage?: number | null;
  dailyHours?: number;
  removed?: boolean;
}
export interface ActualStage {
  id: string;
  parentId: string | null;
  budget: number;
  start: string;
  end: string;
  plans: ActualPlan[];
}
export interface ActualWeek {
  start: string;
  logged: number;
  planned: number;
  difference: number;
  outside: number;
  imported: number;
}
export interface ActualPerson {
  id: string;
  resourceId: string | null;
  name: string;
  weeks: ActualWeek[];
  unplanned: boolean;
}
export interface ActualTotals {
  budget: number;
  planned: number;
  logged: number;
  cost: number | null;
  remaining: number | null;
  consumed: number | null;
  elapsed: number | null;
  band: "normal" | "ahead" | "over" | "incomplete";
  missingHours: number;
  importedHours: number;
}
export interface GanttActuals {
  totals: Map<string, ActualTotals>;
  people: Map<string, ActualPerson[]>;
  firstDate: string | null;
  lastDate: string | null;
  maxWeekHours: number;
  limited: boolean;
}
export interface StageActualAggregate {
  logged: number;
  cost: number | null;
  missingHours: number;
}

export function actualBudgetBand(cost: number | null, budget: number, consumed: number | null, elapsed: number | null): ActualTotals["band"] {
  if (cost == null) return "incomplete";
  if (cost > budget) return "over";
  if (consumed != null && elapsed != null && consumed - elapsed > 10) return "ahead";
  return "normal";
}
export const actualMonday = (day: string) => format(startOfWeek(parseISO(day), { weekStartsOn: 1 }), "yyyy-MM-dd");
export function actualPlanDailyHours(plan: ActualPlan): number {
  if (plan.removed) return 0;
  if (plan.hoursPerDay > 0) return plan.hoursPerDay;
  return plan.percentage && plan.percentage > 0 ? plan.percentage / 100 * (plan.dailyHours ?? 8) : 0;
}

/** Only derived data; entries, snapshots and allocations are never modified. */
export function buildGanttActuals(input: {
  stages: ActualStage[];
  activities: ActualActivity[];
  asOf: string;
  holidays: ReadonlySet<string>;
  summaryId: string;
  aggregates?: Map<string, StageActualAggregate>;
  limited?: boolean;
}): GanttActuals {
  const activities = [...new Map(input.activities.filter(a => a.date <= input.asOf).map(a => [a.id, a])).values()];
  const stageById = new Map(input.stages.map(s => [s.id, s]));
  const people = new Map<string, ActualPerson[]>();
  let maxWeekHours = 1;
  for (const stage of input.stages) {
    const grouped = new Map<string, ActualActivity[]>();
    for (const entry of activities) {
      if (entry.stageId !== stage.id) continue;
      const list = grouped.get(entry.personId) ?? [];
      list.push(entry); grouped.set(entry.personId, list);
    }
    for (const plan of stage.plans.filter(p=>!p.removed)) {
      if (!grouped.has(plan.resourceId)) grouped.set(plan.resourceId,[]);
    }
    const rows: ActualPerson[] = [];
    for (const [id, entries] of grouped) {
      const first = entries[0] ?? {resourceId:id,name:""};
      const plans = stage.plans.filter(p => !p.removed && first.resourceId != null && p.resourceId === first.resourceId);
      const weeks = new Map<string, ActualWeek>();
      for (const entry of entries) {
        const start = actualMonday(entry.date);
        const w = weeks.get(start) ?? { start, logged: 0, planned: 0, difference: 0, outside: 0, imported: 0 };
        w.logged += entry.hours;
        if (!plans.some(p => entry.date >= p.start && entry.date <= p.end)) w.outside += entry.hours;
        if (entry.imported) w.imported += entry.hours;
        weeks.set(start, w);
      }
      // Include planned-only weeks as well, so a week with no logging has a truthful delta.
      for (const plan of plans) {
        for (let date = actualMonday(plan.start); date <= plan.end; date = format(addDays(parseISO(date), 7), "yyyy-MM-dd")) {
          if (date > input.asOf) break;
          if (!weeks.has(date)) weeks.set(date, { start: date, logged: 0, planned: 0, difference: 0, outside: 0, imported: 0 });
        }
      }
      for (const w of weeks.values()) {
        const weekEnd = format(addDays(parseISO(w.start), 6), "yyyy-MM-dd");
        for (const plan of plans) {
          const start = plan.start > w.start ? plan.start : w.start;
          const end = plan.end < weekEnd ? plan.end : weekEnd;
          if (start <= end) w.planned += workingDays(start, end, input.holidays) * actualPlanDailyHours(plan);
        }
        w.difference = w.logged - w.planned;
        maxWeekHours = Math.max(maxWeekHours, w.logged);
      }
      rows.push({ id, resourceId: first.resourceId, name: first.name, weeks: [...weeks.values()].sort((a,b) => a.start.localeCompare(b.start)), unplanned: plans.length === 0 });
    }
    people.set(stage.id, rows);
  }
  const totals = new Map<string, ActualTotals>();
  const visiting = new Set<string>();
  function rollup(id: string): ActualTotals {
    const cached = totals.get(id);
    if (cached) return cached;
    const stage = stageById.get(id);
    if (!stage || visiting.has(id)) throw new Error("Invalid Gantt hierarchy");
    visiting.add(id);
    const kids = input.stages.filter(s => s.parentId === id);
    const childTotals = kids.map(s => rollup(s.id));
    const own = activities.filter(a => a.stageId === id);
    const aggregate = input.aggregates?.get(id);
    const ownMissing = aggregate?.missingHours ?? own.filter(a => a.cost == null).reduce((n,a) => n+a.hours,0);
    const ownLogged = aggregate?.logged ?? own.reduce((n,a) => n+a.hours,0);
    const ownCost = aggregate ? aggregate.cost : ownMissing > 0 ? null : own.reduce((n,a) => n+(a.cost ?? 0),0);
    const missingHours = ownMissing + childTotals.reduce((n,c) => n+c.missingHours,0);
    const cost = ownCost == null || childTotals.some(c => c.cost == null) ? null : ownCost + childTotals.reduce((n,c) => n+(c.cost ?? 0),0);
    const budget = kids.length ? childTotals.reduce((n,c) => n+c.budget,0) : stage.budget;
    const planned = stage.plans.reduce((n,p) => n+workingDays(p.start,p.end,input.holidays)*actualPlanDailyHours(p),0) + childTotals.reduce((n,c) => n+c.planned,0);
    const logged = ownLogged + childTotals.reduce((n,c) => n+c.logged,0);
    const descendants = (s: ActualStage): ActualStage[] => {
      const children = input.stages.filter(k => k.parentId === s.id);
      return children.length ? children.flatMap(descendants) : [s];
    };
    const leaves = descendants(stage);
    const start = leaves.map(s => s.start).sort()[0] ?? stage.start;
    const end = leaves.map(s => s.end).sort().at(-1) ?? stage.end;
    const elapsed = scheduleElapsedPct(start,end,input.asOf);
    const consumed = cost != null && budget > 0 ? cost / budget * 100 : null;
    const result: ActualTotals = { budget,planned,logged,cost,remaining: cost == null ? null : budget-cost,consumed,elapsed,band:actualBudgetBand(cost,budget,consumed,elapsed),missingHours,importedHours: own.filter(a=>a.imported).reduce((n,a)=>n+a.hours,0)+childTotals.reduce((n,c)=>n+c.importedHours,0) };
    totals.set(id,result); visiting.delete(id); return result;
  }
  const roots = input.stages.filter(s => !s.parentId || !stageById.has(s.parentId));
  input.stages.forEach(s => rollup(s.id));
  const rootTotals = roots.map(s => totals.get(s.id)).filter((s): s is ActualTotals => !!s);
  const orphan = activities.filter(a => !a.stageId || !stageById.has(a.stageId));
  const budget = rootTotals.reduce((n,c)=>n+c.budget,0);
  const cost = rootTotals.some(c=>c.cost==null) || orphan.some(a=>a.cost==null) ? null : rootTotals.reduce((n,c)=>n+(c.cost??0),0)+orphan.reduce((n,a)=>n+(a.cost??0),0);
  const dates = input.stages.flatMap(s=>[s.start,s.end]).sort();
  const elapsed = scheduleElapsedPct(dates[0]??null,dates.at(-1)??null,input.asOf);
  const consumed = cost != null && budget>0 ? cost/budget*100 : null;
  totals.set(input.summaryId,{budget,cost,elapsed,consumed,remaining:cost==null?null:budget-cost,planned:rootTotals.reduce((n,c)=>n+c.planned,0),logged:rootTotals.reduce((n,c)=>n+c.logged,0)+orphan.reduce((n,a)=>n+a.hours,0),band:actualBudgetBand(cost,budget,consumed,elapsed),missingHours:rootTotals.reduce((n,c)=>n+c.missingHours,0)+orphan.filter(a=>a.cost==null).reduce((n,a)=>n+a.hours,0),importedHours:activities.filter(a=>a.imported).reduce((n,a)=>n+a.hours,0)});
  if (orphan.length) {
    const grouped = new Map<string,ActualActivity[]>();
    for (const entry of orphan) grouped.set(entry.personId,[...(grouped.get(entry.personId)??[]),entry]);
    people.set(input.summaryId,[...grouped].map(([id,entries])=>{
      const weeks=new Map<string,ActualWeek>();
      for(const entry of entries) {
        const start=actualMonday(entry.date);
        const w=weeks.get(start)??{start,logged:0,planned:0,difference:0,outside:0,imported:0};
        w.logged+=entry.hours;w.difference=w.logged;w.outside+=entry.hours;if(entry.imported) w.imported+=entry.hours;
        maxWeekHours=Math.max(maxWeekHours,w.logged);weeks.set(start,w);
      }
      return {id,resourceId:entries[0]?.resourceId??null,name:entries[0]?.name??"",unplanned:true,weeks:[...weeks.values()].sort((a,b)=>a.start.localeCompare(b.start))};
    }));
  }
  const actualDates = activities.map(a=>a.date).sort();
  return {totals,people,firstDate:actualDates[0]??null,lastDate:actualDates.at(-1)??null,maxWeekHours,limited:input.limited??false};
}