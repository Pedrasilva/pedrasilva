/**
 * Quote-mode planner mutations: cascade + dependency update.
 * Reuses the pure `computeCascade` from project mode; only the I/O layer
 * differs (quote_stages / quote_allocations / quote_stage_dependencies).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeCascade, type StageDependency, type DepType } from "@/lib/projects/dependencies";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useUpdateQuoteStageWithCascade(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      start_date,
      end_date,
      shiftAllocations = true,
    }: {
      id: string;
      start_date: string;
      end_date: string;
      shiftAllocations?: boolean;
    }) => {
      const [{ data: stages, error: sErr }, { data: deps, error: dErr }] = await Promise.all([
        db.from("quote_stages").select("id, start_date, end_date").eq("quote_id", quoteId),
        db.from("quote_stage_dependencies").select("*").eq("quote_id", quoteId),
      ]);
      if (sErr) throw new Error(sErr.message);
      if (dErr) throw new Error(dErr.message);

      // Snapshot every stage's pre-update bounds so we can compute per-stage
      // deltas after the cascade resolves. We need this for BOTH the moved
      // stage AND every cascaded successor — otherwise their allocations
      // dangle when stages slide forward in time.
      const beforeById = new Map<string, { start: string; end: string }>();
      for (const s of (stages ?? []) as { id: string; start_date: string; end_date: string }[]) {
        beforeById.set(s.id, { start: s.start_date, end: s.end_date });
      }

      // Normalize quote dependencies into the canonical shape computeCascade expects.
      const normDeps: StageDependency[] = (deps ?? []).map(
        (d: { id: string; predecessor_stage_id: string; successor_stage_id: string; type: DepType; lag_days: number }) => ({
          id: d.id,
          predecessor_id: d.predecessor_stage_id,
          successor_id: d.successor_stage_id,
          type: d.type,
          lag_days: d.lag_days,
        }),
      );

      const updates = computeCascade(id, start_date, end_date, stages ?? [], normDeps);

      // Persist every cascaded stage's new bounds.
      for (const [stageId, bounds] of updates) {
        const { error } = await db
          .from("quote_stages")
          .update({ start_date: bounds.start_date, end_date: bounds.end_date })
          .eq("id", stageId);
        if (error) throw new Error(error.message);
      }

      // Shift allocations of EVERY moved stage (the user-edited one plus any
      // cascaded successors) by that stage's own start delta, so allocation
      // ranges follow their parent stage. Only pure-shift moves are applied
      // — if the user-edited stage was resized (start delta ≠ end delta),
      // we leave its allocations alone (caller handles resize manually) but
      // still shift cascaded successors (which always preserve duration).
      let shiftedAllocations = 0;
      if (shiftAllocations && updates.size > 0) {
        // Collect per-stage deltas first so we can fetch all allocations in one round-trip.
        const stageDeltas = new Map<string, number>();
        for (const [stageId, bounds] of updates) {
          const before = beforeById.get(stageId);
          if (!before) continue;
          const oldStart = new Date(before.start).getTime();
          const oldEnd = new Date(before.end).getTime();
          const newStart = new Date(bounds.start_date).getTime();
          const newEnd = new Date(bounds.end_date).getTime();
          const startDelta = Math.round((newStart - oldStart) / 86_400_000);
          const endDelta = Math.round((newEnd - oldEnd) / 86_400_000);
          // For the user-edited stage, only shift on pure moves (start==end delta).
          // For cascaded successors, computeCascade preserves duration, so they
          // always satisfy startDelta === endDelta and shift safely.
          if (startDelta !== 0 && startDelta === endDelta) {
            stageDeltas.set(stageId, startDelta);
          }
        }

        if (stageDeltas.size > 0) {
          const { data: allocs, error: aErr } = await db
            .from("quote_allocations_public")
            .select("id, stage_id, start_date, end_date")
            .in("stage_id", Array.from(stageDeltas.keys()));
          if (aErr) throw new Error(aErr.message);
          const shiftDay = (iso: string, delta: number): string => {
            const d = new Date(iso);
            d.setDate(d.getDate() + delta);
            return d.toISOString().slice(0, 10);
          };
          for (const a of (allocs ?? []) as {
            id: string; stage_id: string; start_date: string; end_date: string;
          }[]) {
            const delta = stageDeltas.get(a.stage_id);
            if (!delta) continue;
            const { error } = await db
              .from("quote_allocations")
              .update({
                start_date: shiftDay(a.start_date, delta),
                end_date: shiftDay(a.end_date, delta),
              })
              .eq("id", a.id);
            if (error) throw new Error(error.message);
            shiftedAllocations += 1;
          }
        }
      }

      const updatedIds = Array.from(updates.keys());
      const dependentCount = updatedIds.filter((sid) => sid !== id).length;
      return { updatedIds, shiftedAllocations, dependentCount };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}

export function useUpdateQuoteDependency(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { type?: DepType; lag_days?: number };
    }) => {
      const { data, error } = await db
        .from("quote_stage_dependencies")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);

      // Re-run cascade so lag/type changes push successors forward immediately.
      const predId = (data as { predecessor_stage_id?: string } | null)?.predecessor_stage_id;
      if (predId) {
        const { cascadeFromPredecessor } = await import("./cascade-from-predecessor");
        await cascadeFromPredecessor(quoteId, predId);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}
