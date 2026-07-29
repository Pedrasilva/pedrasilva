import { addDays, differenceInCalendarDays, isWeekend, parseISO, format } from "date-fns";
import type { Stage } from "@/lib/projects/types";

export type DepType = "FS" | "SS" | "FF" | "SF";

export interface StageDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  type: DepType;
  lag_days: number;
}

export interface StageBounds {
  id: string;
  start_date: string;
  end_date: string;
}

export function addWorkingDays(date: Date, days: number): Date {
  if (days === 0) return date;
  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  let d = date;
  while (remaining > 0) {
    d = addDays(d, step);
    if (!isWeekend(d)) remaining--;
  }
  return d;
}

export function snapToWorkingDay(date: Date): Date {
  let d = date;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const parse = (s: string) => parseISO(s);

export function requiredSuccessorStart(pred: StageBounds, dep: StageDependency): Date {
  const predStart = parse(pred.start_date);
  const predEnd = parse(pred.end_date);
  let anchor: Date;
  switch (dep.type) {
    case "FS":
      anchor = addWorkingDays(predEnd, 1 + dep.lag_days);
      break;
    case "SS":
      anchor = addWorkingDays(predStart, dep.lag_days);
      break;
    case "FF":
      anchor = addWorkingDays(predEnd, dep.lag_days);
      break;
    case "SF":
      anchor = addWorkingDays(predStart, dep.lag_days);
      break;
  }
  return snapToWorkingDay(anchor);
}

export function computeCascade(
  changedStageId: string,
  proposedStart: string,
  proposedEnd: string,
  allStages: Pick<Stage, "id" | "start_date" | "end_date">[],
  deps: StageDependency[],
): Map<string, { start_date: string; end_date: string }> {
  const bounds = new Map<string, StageBounds>();
  for (const s of allStages) {
    bounds.set(s.id, { id: s.id, start_date: s.start_date, end_date: s.end_date });
  }
  bounds.set(changedStageId, {
    id: changedStageId,
    start_date: proposedStart,
    end_date: proposedEnd,
  });

  const outgoing = new Map<string, StageDependency[]>();
  const incoming = new Map<string, StageDependency[]>();
  for (const d of deps) {
    const out = outgoing.get(d.predecessor_id) ?? [];
    out.push(d);
    outgoing.set(d.predecessor_id, out);
    const inc = incoming.get(d.successor_id) ?? [];
    inc.push(d);
    incoming.set(d.successor_id, inc);
  }

  const updated = new Map<string, { start_date: string; end_date: string }>();
  updated.set(changedStageId, { start_date: proposedStart, end_date: proposedEnd });

  const queue: string[] = [changedStageId];
  const visits = new Map<string, number>();
  const maxVisits = Math.max(10, deps.length + 2);

  while (queue.length) {
    const currentId = queue.shift()!;
    const succs = outgoing.get(currentId);
    if (!succs?.length) continue;

    for (const edge of succs) {
      const succId = edge.successor_id;
      // Never reposition the stage the user just moved.
      if (succId === changedStageId) continue;
      const succ = bounds.get(succId);
      if (!succ) continue;

      const succStart = parse(succ.start_date);
      const succEnd = parse(succ.end_date);
      const durationDays = differenceInCalendarDays(succEnd, succStart);

      // Evaluate every incoming constraint so the stage lands exactly where
      // the dependency graph says it should — the latest constraint wins.
      let bestStart: Date | null = null;
      let bestEnd: Date | null = null;
      for (const dep of incoming.get(succId) ?? []) {
        const pred = bounds.get(dep.predecessor_id);
        if (!pred) continue;
        const predStart = parse(pred.start_date);
        const predEnd = parse(pred.end_date);

        let newStart: Date;
        let newEnd: Date;
        switch (dep.type) {
          case "FS": {
            newStart = snapToWorkingDay(addWorkingDays(predEnd, 1 + dep.lag_days));
            newEnd = addDays(newStart, durationDays);
            break;
          }
          case "SS": {
            newStart = snapToWorkingDay(addWorkingDays(predStart, dep.lag_days));
            newEnd = addDays(newStart, durationDays);
            break;
          }
          case "FF": {
            newEnd = snapToWorkingDay(addWorkingDays(predEnd, dep.lag_days));
            newStart = addDays(newEnd, -durationDays);
            break;
          }
          case "SF": {
            newEnd = snapToWorkingDay(addWorkingDays(predStart, dep.lag_days));
            newStart = addDays(newEnd, -durationDays);
            break;
          }
        }
        if (!bestStart || newStart > bestStart) {
          bestStart = newStart;
          bestEnd = newEnd;
        }
      }

      if (!bestStart || !bestEnd) continue;

      const shiftedStart = ymd(bestStart);
      const shiftedEnd = ymd(bestEnd);
      // Exact placement: move the successor forward OR backward so the gap on
      // the chart always equals the configured lag.
      if (shiftedStart === succ.start_date && shiftedEnd === succ.end_date) continue;

      updated.set(succId, { start_date: shiftedStart, end_date: shiftedEnd });
      bounds.set(succId, { id: succId, start_date: shiftedStart, end_date: shiftedEnd });

      const seen = visits.get(succId) ?? 0;
      if (seen < maxVisits) {
        visits.set(succId, seen + 1);
        queue.push(succId);
      }
    }
  }

  return updated;
}


export function depEndpoints(
  pred: { x: number; y: number; w: number; h: number },
  succ: { x: number; y: number; w: number; h: number },
  type: DepType,
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const fromX = type === "FS" || type === "FF" ? pred.x + pred.w : pred.x;
  const toX = type === "FS" || type === "SF" ? succ.x : succ.x + succ.w;
  return {
    from: { x: fromX, y: pred.y + pred.h / 2 },
    to: { x: toX, y: succ.y + succ.h / 2 },
  };
}
