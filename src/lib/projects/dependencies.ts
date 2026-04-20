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
  for (const d of deps) {
    const arr = outgoing.get(d.predecessor_id) ?? [];
    arr.push(d);
    outgoing.set(d.predecessor_id, arr);
  }

  const updated = new Map<string, { start_date: string; end_date: string }>();
  updated.set(changedStageId, { start_date: proposedStart, end_date: proposedEnd });

  const queue: string[] = [changedStageId];
  const seenAtThisLevel = new Set<string>();

  while (queue.length) {
    const currentId = queue.shift()!;
    const succs = outgoing.get(currentId);
    if (!succs?.length) continue;
    const pred = bounds.get(currentId);
    if (!pred) continue;

    for (const dep of succs) {
      const succ = bounds.get(dep.successor_id);
      if (!succ) continue;
      const succStart = parse(succ.start_date);
      const succEnd = parse(succ.end_date);
      const durationDays = differenceInCalendarDays(succEnd, succStart);

      let newStart: Date;
      let newEnd: Date;
      const predStart = parse(pred.start_date);
      const predEnd = parse(pred.end_date);

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

      const requiredStart = newStart;
      if (requiredStart > succStart) {
        const shiftedStart = ymd(newStart);
        const shiftedEnd = ymd(newEnd);
        const prev = updated.get(succ.id);
        if (!prev || parse(shiftedStart) > parse(prev.start_date)) {
          updated.set(succ.id, { start_date: shiftedStart, end_date: shiftedEnd });
          bounds.set(succ.id, { id: succ.id, start_date: shiftedStart, end_date: shiftedEnd });
          if (!seenAtThisLevel.has(succ.id)) {
            seenAtThisLevel.add(succ.id);
            queue.push(succ.id);
          }
        }
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
