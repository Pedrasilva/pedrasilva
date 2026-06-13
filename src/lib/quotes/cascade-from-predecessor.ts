/**
 * Re-run the dependency cascade rooted at `predecessorStageId` using its
 * current persisted bounds. Used after dependency create/update so that
 * lag changes (e.g. FS+14d) actually push successors forward on the Gantt.
 */
import { supabase } from "@/integrations/supabase/client";
import { computeCascade, type StageDependency, type DepType } from "@/lib/projects/dependencies";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function cascadeFromPredecessor(quoteId: string, predecessorStageId: string) {
  const [{ data: stages, error: sErr }, { data: deps, error: dErr }] = await Promise.all([
    db.from("quote_stages").select("id, start_date, end_date, parent_stage_id").eq("quote_id", quoteId),
    db.from("quote_stage_dependencies").select("*").eq("quote_id", quoteId),
  ]);
  if (sErr) throw new Error(sErr.message);
  if (dErr) throw new Error(dErr.message);

  type StageRow = { id: string; start_date: string; end_date: string; parent_stage_id: string | null };
  const stageRows = (stages ?? []) as StageRow[];
  const childrenByParent = new Map<string, StageRow[]>();
  const stageById = new Map(stageRows.map((s) => [s.id, s]));
  for (const s of stageRows) {
    if (!s.parent_stage_id) continue;
    const arr = childrenByParent.get(s.parent_stage_id) ?? [];
    arr.push(s);
    childrenByParent.set(s.parent_stage_id, arr);
  }

  const rollupById = new Map<string, { start_date: string; end_date: string }>();
  const rollup = (s: StageRow): { start_date: string; end_date: string } => {
    const kids = childrenByParent.get(s.id) ?? [];
    if (kids.length === 0) return { start_date: s.start_date, end_date: s.end_date };
    let minStart = "";
    let maxEnd = "";
    for (const kid of kids) {
      const bounds = rollup(kid);
      if (!minStart || bounds.start_date < minStart) minStart = bounds.start_date;
      if (!maxEnd || bounds.end_date > maxEnd) maxEnd = bounds.end_date;
    }
    const out = { start_date: minStart || s.start_date, end_date: maxEnd || s.end_date };
    rollupById.set(s.id, out);
    return out;
  };
  for (const s of stageRows) rollup(s);

  const cascadeStages = stageRows.map((s) => ({
    id: s.id,
    start_date: rollupById.get(s.id)?.start_date ?? s.start_date,
    end_date: rollupById.get(s.id)?.end_date ?? s.end_date,
  }));

  const pred = cascadeStages.find((s) => s.id === predecessorStageId);
  if (!pred) return;

  const normDeps: StageDependency[] = (deps ?? []).map(
    (d: { id: string; predecessor_stage_id: string; successor_stage_id: string; type: DepType; lag_days: number }) => ({
      id: d.id,
      predecessor_id: d.predecessor_stage_id,
      successor_id: d.successor_stage_id,
      type: d.type,
      lag_days: d.lag_days,
    }),
  );

  const updates = computeCascade(
    pred.id,
    pred.start_date,
    pred.end_date,
    cascadeStages,
    normDeps,
  );

  const shiftedStageDeltas = new Map<string, number>();
  for (const [stageId, bounds] of updates) {
    if (stageId === pred.id) continue;
    const before = cascadeStages.find((s) => s.id === stageId);
    if (!before) continue;
    if (before.start_date === bounds.start_date && before.end_date === bounds.end_date) continue;

    const startDelta = Math.round(
      (new Date(bounds.start_date).getTime() - new Date(before.start_date).getTime()) / 86_400_000,
    );
    const endDelta = Math.round(
      (new Date(bounds.end_date).getTime() - new Date(before.end_date).getTime()) / 86_400_000,
    );
    const descendants = collectLeafDescendants(stageId, childrenByParent);

    if (descendants.length > 0 && startDelta !== 0 && startDelta === endDelta) {
      for (const child of descendants) {
        const shiftedStart = shiftDay(child.start_date, startDelta);
        const shiftedEnd = shiftDay(child.end_date, startDelta);
        const { error } = await db
          .from("quote_stages")
          .update({ start_date: shiftedStart, end_date: shiftedEnd })
          .eq("id", child.id);
        if (error) throw new Error(error.message);
        shiftedStageDeltas.set(child.id, startDelta);
      }
      continue;
    }

    const { error } = await db
      .from("quote_stages")
      .update({ start_date: bounds.start_date, end_date: bounds.end_date })
      .eq("id", stageId);
    if (error) throw new Error(error.message);

    if (startDelta !== 0 && startDelta === endDelta) {
      shiftedStageDeltas.set(stageId, startDelta);
    }
  }

  if (shiftedStageDeltas.size > 0) {
    const { data: allocs } = await db
      .from("quote_allocations_public")
      .select("id, stage_id, start_date, end_date")
      .in("stage_id", Array.from(shiftedStageDeltas.keys()));
    for (const a of (allocs ?? []) as { id: string; stage_id: string; start_date: string; end_date: string }[]) {
      const delta = shiftedStageDeltas.get(a.stage_id);
      if (!delta) continue;
      await db
        .from("quote_allocations")
        .update({
          start_date: shiftDay(a.start_date, delta),
          end_date: shiftDay(a.end_date, delta),
        })
        .eq("id", a.id);
    }
  }
}

function collectLeafDescendants(stageId: string, childrenByParent: Map<string, { id: string; start_date: string; end_date: string }[]>) {
  const leaves: { id: string; start_date: string; end_date: string }[] = [];
  const stack = [...(childrenByParent.get(stageId) ?? [])];
  while (stack.length > 0) {
    const child = stack.pop()!;
    const kids = childrenByParent.get(child.id) ?? [];
    if (kids.length > 0) stack.push(...kids);
    else leaves.push(child);
  }
  return leaves;
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
