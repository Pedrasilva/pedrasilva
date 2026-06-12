/**
 * Quote-owned stages — mirror of pm_stages but linked to fee_proposals.
 * Phase A schema; hooks added in Phase B without touching the Gantt UI.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteStage } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QuoteStageInsert = Partial<QuoteStage> & {
  quote_id: string;
  name: string;
  start_date: string;
  end_date: string;
};
export type QuoteStageUpdate = Partial<QuoteStage> & { id: string };

export function useQuoteStages(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-stages", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<QuoteStage[]> => {
      const { data, error } = await db
        .from("quote_stages")
        .select("*")
        .eq("quote_id", quoteId!)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as QuoteStage[];
    },
  });
}

export function useUpsertQuoteStage(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteStageInsert | QuoteStageUpdate) => {
      if ("id" in input && input.id) {
        const { id, ...rest } = input;
        // Any user edit stamps manual_override=true so a future ontology
        // re-bootstrap will preserve this row (see proposal-ontology/bootstrap).
        const { data, error } = await db
          .from("quote_stages")
          .update({ ...rest, manual_override: true })
          .eq("id", id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as QuoteStage;
      }
      const { data, error } = await db
        .from("quote_stages")
        .insert({ ...input, quote_id: quoteId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as QuoteStage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}

export function useDeleteQuoteStage(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: stageRows, error: stageRowsError } = await db
        .from("quote_stages")
        .select("id,parent_stage_id")
        .eq("quote_id", quoteId);
      if (stageRowsError) throw new Error(stageRowsError.message);

      const childrenByParent = new Map<string | null, string[]>();
      for (const row of (stageRows ?? []) as Array<{ id: string; parent_stage_id: string | null }>) {
        const parentId = row.parent_stage_id ?? null;
        const children = childrenByParent.get(parentId) ?? [];
        children.push(row.id);
        childrenByParent.set(parentId, children);
      }

      const stageIds = new Set<string>([id]);
      const stack = [id];
      while (stack.length > 0) {
        const current = stack.pop()!;
        for (const childId of childrenByParent.get(current) ?? []) {
          if (stageIds.has(childId)) continue;
          stageIds.add(childId);
          stack.push(childId);
        }
      }

      const ids = [...stageIds];
      if (ids.length > 0) {
        const { error: paymentError } = await db
          .from("quote_payment_schedule_items")
          .delete()
          .in("stage_id", ids);
        if (paymentError) throw new Error(paymentError.message);
      }

      const { data, error } = await db
        .from("quote_stages")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error(
          "Stage could not be deleted. You may not have permission, or the row is referenced elsewhere.",
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-payment-schedule", quoteId] });
    },
  });
}

