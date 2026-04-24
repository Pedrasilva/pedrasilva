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

      // Detect pure move (start delta == end delta) so allocations follow.
      const movedStage = (stages ?? []).find((s: { id: string }) => s.id === id);
      let allocDeltaDays = 0;
      if (movedStage && shiftAllocations) {
        const oldStart = new Date(movedStage.start_date as string).getTime();
        const oldEnd = new Date(movedStage.end_date as string).getTime();
        const newStart = new Date(start_date).getTime();
        const newEnd = new Date(end_date).getTime();
        const startDelta = Math.round((newStart - oldStart) / 86_400_000);
        const endDelta = Math.round((newEnd - oldEnd) / 86_400_000);
        if (startDelta === endDelta && startDelta !== 0) allocDeltaDays = startDelta;
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

      for (const [stageId, bounds] of updates) {
        const { error } = await db
          .from("quote_stages")
          .update({ start_date: bounds.start_date, end_date: bounds.end_date })
          .eq("id", stageId);
        if (error) throw new Error(error.message);
      }

      let shiftedAllocations = 0;
      if (allocDeltaDays !== 0) {
        const { data: allocs } = await db
          .from("quote_allocations")
          .select("id, start_date, end_date")
          .eq("stage_id", id);
        const shiftDay = (iso: string): string => {
          const d = new Date(iso);
          d.setDate(d.getDate() + allocDeltaDays);
          return d.toISOString().slice(0, 10);
        };
        for (const a of allocs ?? []) {
          const { error } = await db
            .from("quote_allocations")
            .update({
              start_date: shiftDay(a.start_date as string),
              end_date: shiftDay(a.end_date as string),
            })
            .eq("id", a.id);
          if (error) throw new Error(error.message);
          shiftedAllocations += 1;
        }
      }

      return { updatedIds: Array.from(updates.keys()), shiftedAllocations };
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
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
    },
  });
}
