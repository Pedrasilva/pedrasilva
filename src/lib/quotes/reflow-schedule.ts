/**
 * Reflow the full Gantt: walk every dependency and push successors
 * forward (preserving duration) until all FS/SS/FF/SF constraints are
 * satisfied. Used to align stage dates with the dependency graph when
 * deps were created in bulk (ontology bootstrap) or edited out of order.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  addWorkingDays,
  snapToWorkingDay,
  type DepType,
  type StageDependency,
} from "@/lib/projects/dependencies";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

interface Bounds {
  id: string;
  start_date: string;
  end_date: string;
}

export interface ReflowResult {
  updatedStageCount: number;
  shiftedAllocationCount: number;
}

export async function reflowQuoteSchedule(quoteId: string): Promise<ReflowResult> {
  const [{ data: stages, error: sErr }, { data: deps, error: dErr }] = await Promise.all([
    db.from("quote_stages").select("id, start_date, end_date").eq("quote_id", quoteId),
    db.from("quote_stage_dependencies").select("*").eq("quote_id", quoteId),
  ]);
  if (sErr) throw new Error(sErr.message);
  if (dErr) throw new Error(dErr.message);

  const original = new Map<string, Bounds>();
  const bounds = new Map<string, Bounds>();
  for (const s of (stages ?? []) as Bounds[]) {
    original.set(s.id, { ...s });
    bounds.set(s.id, { ...s });
  }

  const normDeps: StageDependency[] = (deps ?? []).map(
    (d: {
      id: string;
      predecessor_stage_id: string;
      successor_stage_id: string;
      type: DepType;
      lag_days: number;
    }) => ({
      id: d.id,
      predecessor_id: d.predecessor_stage_id,
      successor_id: d.successor_stage_id,
      type: d.type,
      lag_days: d.lag_days,
    }),
  );

  // Iterate until stable. Cap iterations to avoid infinite loops on cycles
  // (the DB trigger blocks cycles, but defensive cap is cheap).
  const maxIter = Math.max(10, normDeps.length * 4);
  let changed = true;
  let iter = 0;
  while (changed && iter < maxIter) {
    changed = false;
    iter++;
    for (const dep of normDeps) {
      const pred = bounds.get(dep.predecessor_id);
      const succ = bounds.get(dep.successor_id);
      if (!pred || !succ) continue;
      const predStart = parseISO(pred.start_date);
      const predEnd = parseISO(pred.end_date);
      const succStart = parseISO(succ.start_date);
      const succEnd = parseISO(succ.end_date);
      const duration = differenceInCalendarDays(succEnd, succStart);

      let newStart: Date;
      let newEnd: Date;
      switch (dep.type) {
        case "FS":
          newStart = snapToWorkingDay(addWorkingDays(predEnd, 1 + dep.lag_days));
          newEnd = addDays(newStart, duration);
          break;
        case "SS":
          newStart = snapToWorkingDay(addWorkingDays(predStart, dep.lag_days));
          newEnd = addDays(newStart, duration);
          break;
        case "FF":
          newEnd = snapToWorkingDay(addWorkingDays(predEnd, dep.lag_days));
          newStart = addDays(newEnd, -duration);
          break;
        case "SF":
          newEnd = snapToWorkingDay(addWorkingDays(predStart, dep.lag_days));
          newStart = addDays(newEnd, -duration);
          break;
      }
      if (newStart > succStart) {
        bounds.set(succ.id, {
          id: succ.id,
          start_date: ymd(newStart),
          end_date: ymd(newEnd),
        });
        changed = true;
      }
    }
  }

  // Persist changed stages and shift their allocations by the same delta.
  let updatedStageCount = 0;
  let shiftedAllocationCount = 0;
  for (const [id, b] of bounds) {
    const before = original.get(id);
    if (!before) continue;
    if (before.start_date === b.start_date && before.end_date === b.end_date) continue;

    const { error } = await db
      .from("quote_stages")
      .update({ start_date: b.start_date, end_date: b.end_date })
      .eq("id", id);
    if (error) throw new Error(error.message);
    updatedStageCount++;

    const startDelta = Math.round(
      (parseISO(b.start_date).getTime() - parseISO(before.start_date).getTime()) / 86_400_000,
    );
    const endDelta = Math.round(
      (parseISO(b.end_date).getTime() - parseISO(before.end_date).getTime()) / 86_400_000,
    );
    if (startDelta !== 0 && startDelta === endDelta) {
      const { data: allocs } = await db
        .from("quote_allocations_public")
        .select("id, start_date, end_date")
        .eq("stage_id", id);
      const shiftDay = (iso: string, delta: number): string => {
        const d = new Date(iso);
        d.setDate(d.getDate() + delta);
        return d.toISOString().slice(0, 10);
      };
      for (const a of (allocs ?? []) as { id: string; start_date: string; end_date: string }[]) {
        const { error: aErr } = await db
          .from("quote_allocations")
          .update({
            start_date: shiftDay(a.start_date, startDelta),
            end_date: shiftDay(a.end_date, startDelta),
          })
          .eq("id", a.id);
        if (aErr) throw new Error(aErr.message);
        shiftedAllocationCount++;
      }
    }
  }

  return { updatedStageCount, shiftedAllocationCount };
}
