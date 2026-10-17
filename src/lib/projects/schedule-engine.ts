import { addDays, format, isWeekend, parseISO } from "date-fns";
import type { DepType, StageDependency } from "./dependencies";

export const RELATIVE_ORIGIN = "2000-01-03";
export interface ScheduleStage {
  id: string; name?: string; start_date: string; end_date: string;
  parent_stage_id?: string | null; is_locked?: boolean; stage_kind?: string;
}
export interface ScheduleAllocation {
  id: string; stage_id: string; start_date: string; end_date: string;
  is_locked?: boolean; source?: string; external_id?: string | null;
}
export interface ScheduleState {
  stages: ScheduleStage[]; allocations: ScheduleAllocation[];
  dependencies: StageDependency[]; holidays: string[]; relative: boolean; revision: string;
}
export interface SchedulePatch {
  stages: Array<{id: string; start_date: string; end_date: string}>;
  allocations: Array<{id: string; start_date: string; end_date: string}>;
  dependencies: StageDependency[];
}
const iso = (d: Date) => format(d, "yyyy-MM-dd");
export function scheduleCalendar(holidays: Iterable<string> = []) {
  const closed = new Set(holidays);
  const working = (d: string) => !isWeekend(parseISO(d)) && !closed.has(d);
  const snap = (d: string, direction = 1): string => {
    for (let i = 0; i < 36600; i++) {
      if (working(d)) return d;
      d = iso(addDays(parseISO(d), direction));
    }
    throw new Error("gantt.schedule.invalidRange");
  };
  const shift = (d: string, days: number) => {
    if (!Number.isInteger(days) || Math.abs(days) > 36600) throw new Error("gantt.schedule.invalidRange");
    const direction = days < 0 ? -1 : 1;
    for (let left = Math.abs(days); left > 0;) {
      d = iso(addDays(parseISO(d), direction));
      if (working(d)) left--;
    }
    return snap(d, direction);
  };
  const duration = (start: string, end: string) => {
    let count = 0;
    for (let d = start, i = 0; d <= end && i < 36600; i++, d = iso(addDays(parseISO(d), 1))) {
      if (working(d)) count++;
    }
    return Math.max(1, count);
  };
  const offset = (start: string, end: string) => end >= start
    ? duration(start, end) - (working(start) ? 1 : 0)
    : -(duration(end, start) - (working(end) ? 1 : 0));
  return { working, snap, shift, duration, offset };
}

export function summaryBounds(stages: ScheduleStage[]): Map<string, {start_date: string; end_date: string}> {
  const byId = new Map(stages.map(s => [s.id, s]));
  const children = new Map<string, ScheduleStage[]>();
  for (const s of stages) if (s.parent_stage_id && byId.has(s.parent_stage_id)) {
    children.set(s.parent_stage_id, [...(children.get(s.parent_stage_id) ?? []), s]);
  }
  const bounds = new Map<string, {start_date: string; end_date: string}>();
  const visit = (s: ScheduleStage, seen: Set<string>): {start_date: string; end_date: string} => {
    if (seen.has(s.id)) throw new Error("gantt.schedule.cycle");
    const kids = children.get(s.id) ?? [];
    const next = new Set(seen).add(s.id);
    const rows = kids.length ? kids.map(k => visit(k, next)) : [s];
    const result = { start_date: rows.reduce((v, k) => k.start_date < v ? k.start_date : v, rows[0]?.start_date ?? s.start_date),
      end_date: rows.reduce((v, k) => k.end_date > v ? k.end_date : v, rows[0]?.end_date ?? s.end_date) };
    bounds.set(s.id, result);
    return result;
  };
  for (const s of stages) visit(s, new Set());
  return bounds;
}

/** A link between a summary and one of its own descendants (common in
 * imported plans). The child already sits inside the parent, so the link
 * carries no schedule meaning; it is kept as data but ignored when scheduling. */
export function isNestedLink(stages: ScheduleStage[], d: {predecessor_id: string; successor_id: string}): boolean {
  const parent = new Map(stages.map(s => [s.id, s.parent_stage_id ?? null]));
  const under = (id: string, root: string) => {
    for (let p = parent.get(id), i = 0; p && i < 1000; p = parent.get(p), i++) if (p === root) return true;
    return false;
  };
  return under(d.successor_id, d.predecessor_id) || under(d.predecessor_id, d.successor_id);
}
export function schedulingLinks(stages: ScheduleStage[], deps: StageDependency[]) {
  return deps.filter(d => !isNestedLink(stages, d));
}
export function validateScheduleGraph(stages: ScheduleStage[], deps: StageDependency[], strict = false): void {
  const ids = new Set(stages.map(s => s.id));
  const edges = new Map<string, string[]>();
  const linkIds = new Set<string>();
  const pairs = new Set<string>();
  for (const s of stages) if (s.parent_stage_id) edges.set(s.id, [...(edges.get(s.id) ?? []), s.parent_stage_id]);
  for (const d of deps) {
    if (!ids.has(d.predecessor_id) || !ids.has(d.successor_id) || !["FS","SS","FF","SF"].includes(d.type)
      || !Number.isInteger(d.lag_days) || Math.abs(d.lag_days)>36600 || linkIds.has(d.id) || pairs.has(`${d.predecessor_id}:${d.successor_id}`)) throw new Error("gantt.schedule.invalidLink");
    linkIds.add(d.id); pairs.add(`${d.predecessor_id}:${d.successor_id}`);
    if (strict || !isNestedLink(stages, d)) edges.set(d.predecessor_id, [...(edges.get(d.predecessor_id) ?? []), d.successor_id]);
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw new Error("gantt.schedule.cycle");
    if (visited.has(id)) return;
    active.add(id);
    for (const next of edges.get(id) ?? []) visit(next);
    active.delete(id); visited.add(id);
  };
  for (const id of ids) visit(id);
}

export function constraintBounds(pred: ScheduleStage, type: DepType, lag: number, duration: number,
  calendar: ReturnType<typeof scheduleCalendar>) {
  if (type === "FS" || type === "SS") {
    const start_date = calendar.shift(type === "FS" ? pred.end_date : pred.start_date, lag + (type === "FS" ? 1 : 0));
    return {start_date, end_date: calendar.shift(start_date, duration - 1)};
  }
  const end_date = calendar.shift(type === "FF" ? pred.end_date : pred.start_date, lag);
  return {start_date: calendar.shift(end_date, -(duration - 1)), end_date};
}

/** Read-only proposal for repairing an invalid legacy graph. Nothing is
 * removed until the user confirms the complete relative initialization. */
export function reviewScheduleLinks(stages: ScheduleStage[], deps: StageDependency[]) {
  validateScheduleGraph(stages, []);
  const accepted: StageDependency[] = [];
  const rejected: StageDependency[] = [];
  for (const dep of deps) {
    try {
      validateScheduleGraph(stages, [...accepted, dep], true);
      accepted.push(dep);
    } catch (error) {
      if (!(error instanceof Error) || !["gantt.schedule.cycle", "gantt.schedule.invalidLink"].includes(error.message)) throw error;
      rejected.push(dep);
    }
  }
  return {accepted,rejected};
}

export function recomputeSchedule(state: ScheduleState, deps = state.dependencies,
  edits: Array<{id: string; start_date: string; end_date: string}> = [], roots?: string[]): SchedulePatch {
  validateScheduleGraph(state.stages, deps);
  const allDeps = deps;
  deps = schedulingLinks(state.stages, deps);
  const calendar = scheduleCalendar(state.relative ? [] : state.holidays);
  const stages = state.stages.map(s => ({...s}));
  const byId = new Map(stages.map(s => [s.id, s]));
  const parentIds = new Set(stages.map(s => s.parent_stage_id).filter(Boolean));
  const affected = new Set(roots ?? edits.map(s => s.id));
  for (const edit of edits) {
    const stage = byId.get(edit.id);
    if (!stage || parentIds.has(edit.id)) throw new Error("gantt.schedule.summaryReadOnly");
    if (stage.is_locked) throw new Error("gantt.schedule.locked");
    stage.start_date = calendar.snap(edit.start_date);
    stage.end_date = calendar.snap(edit.end_date, -1);
    if (stage.end_date < stage.start_date) stage.end_date = stage.start_date;
  }
  // Include dependent ancestors: a child's changed envelope can move a
  // successor linked to its summary even when the parent has no saved edit.
  for (let changed = true; changed;) {
    changed = false;
    for (const s of stages) if (affected.has(s.id) && s.parent_stage_id && !affected.has(s.parent_stage_id)) {
      affected.add(s.parent_stage_id); changed = true;
    }
    for (const d of deps) if (affected.has(d.predecessor_id) && !affected.has(d.successor_id)) {
      affected.add(d.successor_id); changed = true;
    }
  }
  const initialSummary=summaryBounds(stages);
  const durations = new Map(stages.map(s => {
    const bounds=initialSummary.get(s.id) ?? s;
    return [s.id, calendar.duration(bounds.start_date, bounds.end_date)];
  }));
  const explicit = new Set(edits.map(s => s.id));
  const linkedIds = new Set(deps.map(d => d.successor_id));
  for (let pass = 0; pass <= stages.length; pass++) {
    let changed = false;
    const summary = summaryBounds(stages);
    for (const stage of stages) {
      if (!affected.has(stage.id) || explicit.has(stage.id) || stage.is_locked) continue;
      const incoming = deps.filter(d => d.successor_id === stage.id);
      let best: {start_date: string; end_date: string} | undefined;
      for (const dep of incoming) {
        const pred = byId.get(dep.predecessor_id);
        if (!pred) continue;
        const candidate = constraintBounds({...pred, ...summary.get(pred.id)}, dep.type, dep.lag_days,
          durations.get(stage.id) ?? 1, calendar);
        if (!best || candidate.start_date > best.start_date) best = candidate;
      }
      if (!best) continue; // Last link removed: retain current explicit position.
      const before = summary.get(stage.id) ?? stage;
      if (parentIds.has(stage.id)) {
        // A linked summary positions only its "free" leaves: descendants with
        // no link of their own (nor on an intermediate summary) and not
        // explicitly placed. Linked children follow their own links, so the
        // summary and its children can never fight each other.
        const free = stages.filter(child => {
          if (parentIds.has(child.id) || explicit.has(child.id)) return false;
          const chain = [child.id];
          for (let p = child.parent_stage_id; p && p !== stage.id; p = byId.get(p)?.parent_stage_id) chain.push(p);
          return chain.length && ancestorsOf(stages, child.id).includes(stage.id) && !chain.some(id => linkedIds.has(id));
        });
        if (!free.length) continue;
        const freeStart = free.reduce((m, c) => c.start_date < m ? c.start_date : m, free[0].start_date);
        const shift = calendar.offset(freeStart, best.start_date);
        if (!shift) continue;
        for (const child of free) {
          if (child.is_locked) throw new Error("gantt.schedule.locked");
          child.start_date = calendar.shift(child.start_date, shift);
          child.end_date = calendar.shift(child.start_date, (durations.get(child.id) ?? 1) - 1);
        }
      } else {
        if (before.start_date === best.start_date && before.end_date === best.end_date) continue;
        Object.assign(stage, best);
      }
      changed = true;
    }
    if (!changed) break;
    if (pass === stages.length) throw new Error("gantt.schedule.invalidLink");
  }
  const rolled = summaryBounds(stages);
  const updates = stages.flatMap(s => {
    const original = state.stages.find(v => v.id === s.id);
    const bounds = rolled.get(s.id) ?? s;
    return original && (bounds.start_date !== original.start_date || bounds.end_date !== original.end_date)
      ? [{id:s.id, ...bounds}] : [];
  });
  const changedIds = new Set(updates.map(s => s.id));
  const allocations = state.allocations.flatMap(a => {
    if (!changedIds.has(a.stage_id) || parentIds.has(a.stage_id)) return [];
    const stage = rolled.get(a.stage_id);
    if (!stage || (a.start_date === stage.start_date && a.end_date === stage.end_date)) return [];
    if (a.is_locked || a.external_id || ["import","imported_accelo"].includes(a.source ?? "")) throw new Error("gantt.schedule.lockedAllocation");
    return [{id:a.id, ...stage}];
  });
  return { stages:updates, allocations, dependencies:allDeps };
}

export function dependencySlack(pred: ScheduleStage, succ: ScheduleStage, dep: StageDependency,
  holidays: Iterable<string> = []): number {
  const calendar = scheduleCalendar(holidays);
  const required = constraintBounds(pred, dep.type, dep.lag_days, calendar.duration(succ.start_date, succ.end_date), calendar);
  return calendar.offset(required.start_date, succ.start_date);
}
export type StageEdit = {id: string; start_date: string; end_date: string; move?: boolean};
const ancestorsOf = (stages: ScheduleStage[], id: string) => {
  const byId = new Map(stages.map(s => [s.id, s])); const out: string[] = [];
  for (let p = byId.get(id)?.parent_stage_id; p && !out.includes(p); p = byId.get(p)?.parent_stage_id) out.push(p);
  return out;
};
/** Moves stages to where the planner dropped them. `move` edits keep their
 * working-day duration. Incoming links of moved stages (and their summaries)
 * are re-timed to the new gap, so a stage is never snapped back; negative
 * gaps become leads. Successors follow through recomputeSchedule. */
export function moveStagesPatch(state: ScheduleState, edits: StageEdit[], retimeLinks = true): SchedulePatch {
  validateScheduleGraph(state.stages, state.dependencies);
  const calendar = scheduleCalendar(state.relative ? [] : state.holidays);
  const byId = new Map(state.stages.map(s => [s.id, s]));
  const parentIds = new Set(state.stages.map(s => s.parent_stage_id).filter(Boolean));
  const normalized = edits.map(e => {
    const stage = byId.get(e.id);
    if (!stage || parentIds.has(e.id)) throw new Error("gantt.schedule.summaryReadOnly");
    if (stage.is_locked) throw new Error("gantt.schedule.locked");
    const start_date = calendar.snap(e.start_date);
    const end_date = e.move ? calendar.shift(start_date, calendar.duration(stage.start_date, stage.end_date) - 1)
      : calendar.snap(e.end_date, -1);
    return {id: e.id, start_date, end_date: end_date < start_date ? start_date : end_date};
  });
  let deps = state.dependencies;
  if (retimeLinks) {
    const temp = state.stages.map(s => ({...s, ...normalized.find(e => e.id === s.id)}));
    const bounds = summaryBounds(temp);
    const editedIds = new Set(normalized.map(e => e.id));
    const leavesUnder = (id: string) => temp.filter(c => !parentIds.has(c.id) && ancestorsOf(temp, c.id).includes(id));
    const retime = new Set(normalized.flatMap(e => [e.id, ...ancestorsOf(temp, e.id).filter(a => leavesUnder(a).every(c => editedIds.has(c.id)))]));
    deps = deps.map(d => {
      if (!retime.has(d.successor_id) || isNestedLink(temp, d)) return d;
      const pred = {...temp.find(s => s.id === d.predecessor_id)!, ...bounds.get(d.predecessor_id)};
      const succ = bounds.get(d.successor_id)!;
      const req = constraintBounds(pred, d.type, 0, calendar.duration(succ.start_date, succ.end_date), calendar);
      const lag_days = d.type === "FS" || d.type === "SS" ? calendar.offset(req.start_date, succ.start_date)
        : calendar.offset(req.end_date, succ.end_date);
      return lag_days === d.lag_days ? d : {...d, lag_days};
    });
  }
  return recomputeSchedule(state, deps, normalized);
}
/** Shifts the project start: every stage with no predecessor (on itself or a
 * summary above it) moves by the same number of working days; linked stages
 * follow. Locked roots stay in place and are reported. */
export function shiftProjectStartPatch(state: ScheduleState, newStart: string) {
  const calendar = scheduleCalendar(state.relative ? [] : state.holidays);
  const parentIds = new Set(state.stages.map(s => s.parent_stage_id).filter(Boolean));
  const linked = new Set(schedulingLinks(state.stages, state.dependencies).map(d => d.successor_id));
  const retainer = new Set(state.stages.filter(s => s.stage_kind === "retainer_monthly").map(s => s.id));
  const regular = state.stages.filter(s => !retainer.has(s.id) && !ancestorsOf(state.stages, s.id).some(a => retainer.has(a)));
  if (!regular.length) return {patch: {stages: [], allocations: [], dependencies: state.dependencies}, days: 0, locked: 0};
  const first = calendar.snap(regular.reduce((m, s) => s.start_date < m ? s.start_date : m, regular[0].start_date));
  const days = calendar.offset(first, calendar.snap(newStart));
  const roots = regular.filter(s => !parentIds.has(s.id) && ![s.id, ...ancestorsOf(state.stages, s.id)].some(id => linked.has(id)));
  const locked = roots.filter(s => s.is_locked).length;
  if (!days) return {patch: {stages: [], allocations: [], dependencies: state.dependencies}, days, locked: 0};
  const edits = roots.filter(s => !s.is_locked).map(s => {
    const start_date = calendar.shift(calendar.snap(s.start_date), days);
    return {id: s.id, start_date, end_date: calendar.shift(start_date, calendar.duration(s.start_date, s.end_date) - 1)};
  });
  if (!edits.length && locked) throw new Error("gantt.schedule.locked");
  return {patch: recomputeSchedule(state, state.dependencies, edits), days, locked};
}
