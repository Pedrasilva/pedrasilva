import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteStageDependency, QuoteDepType } from "./types";
import { computeCascade, type StageDependency, type DepType } from "@/lib/projects/dependencies";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QuoteDependencyInsert = {
  quote_id: string;
  predecessor_stage_id: string;
  successor_stage_id: string;
  type?: QuoteDepType;
  lag_days?: number;
};

/**
 * Re-run the dependency cascade rooted at `predecessorStageId` using its
 * current persisted bounds. Used after dependency create/update so that
 * lag changes (e.g. FS+14d) actually push successors forward on the Gantt.
 */
async function cascadeFromPredecessor(quoteId: string, predecessorStageId: string) {
  const [{ data: stages, error: sErr }, { data: deps, error: dErr }] = await Promise.all([
    db.from("quote_stages").select("id, start_date, end_date").eq("quote_id", quoteId),
    db.from("quote_stage_dependencies").select("*").eq("quote_id", quoteId),
  ]);
  if (sErr) throw new Error(sErr.message);
  if (dErr) throw new Error(dErr.message);

  const pred = (stages ?? []).find((s: { id: string }) => s.id === predecessorStageId);
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
    stages ?? [],
    normDeps,
  );

  for (const [stageId, bounds] of updates) {
    if (stageId === pred.id) continue; // bounds unchanged
    const before = (stages ?? []).find((s: { id: string }) => s.id === stageId) as
      | { start_date: string; end_date: string }
      | undefined;
    if (!before) continue;
    if (before.start_date === bounds.start_date && before.end_date === bounds.end_date) continue;

    const { error } = await db
      .from("quote_stages")
      .update({ start_date: bounds.start_date, end_date: bounds.end_date })
      .eq("id", stageId);
    if (error) throw new Error(error.message);

    // Shift this stage's allocations by the same start delta.
    const startDelta = Math.round(
      (new Date(bounds.start_date).getTime() - new Date(before.start_date).getTime()) / 86_400_000,
    );
    const endDelta = Math.round(
      (new Date(bounds.end_date).getTime() - new Date(before.end_date).getTime()) / 86_400_000,
    );
    if (startDelta !== 0 && startDelta === endDelta) {
      const { data: allocs } = await db
        .from("quote_allocations_public")
        .select("id, start_date, end_date")
        .eq("stage_id", stageId);
      const shiftDay = (iso: string, delta: number): string => {
        const d = new Date(iso);
        d.setDate(d.getDate() + delta);
        return d.toISOString().slice(0, 10);
      };
      for (const a of (allocs ?? []) as { id: string; start_date: string; end_date: string }[]) {
        await db
          .from("quote_allocations")
          .update({
            start_date: shiftDay(a.start_date, startDelta),
            end_date: shiftDay(a.end_date, startDelta),
          })
          .eq("id", a.id);
      }
    }
  }
}

export function useQuoteDependencies(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-dependencies", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<QuoteStageDependency[]> => {
      const { data, error } = await db
        .from("quote_stage_dependencies")
        .select("*")
        .eq("quote_id", quoteId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as QuoteStageDependency[];
    },
  });
}

export function useCreateQuoteDependency(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteDependencyInsert) => {
      const { data, error } = await db
        .from("quote_stage_dependencies")
        .insert({ ...input, quote_id: quoteId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await cascadeFromPredecessor(quoteId, input.predecessor_stage_id);
      return data as QuoteStageDependency;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}

export function useDeleteQuoteDependency(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("quote_stage_dependencies")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
    },
  });
}
