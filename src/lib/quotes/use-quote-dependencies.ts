import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteStageDependency, QuoteDepType } from "./types";
import { changeGanttDependency } from "@/lib/projects/gantt-schedule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QuoteDependencyInsert = {
  quote_id: string;
  predecessor_stage_id: string;
  successor_stage_id: string;
  type?: QuoteDepType;
  lag_days?: number;
};

export function useQuoteDependencies(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-dependencies", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<QuoteStageDependency[]> => {
      const { data, error } = await db
        .from("quote_stage_dependencies")
        .select("*")
        .eq("quote_id", quoteId ?? "");
      if (error) throw new Error(error.message);
      return (data ?? []) as QuoteStageDependency[];
    },
  });
}

export function useCreateQuoteDependency(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteDependencyInsert) => {
      return await changeGanttDependency("quote",quoteId,"create",{
        predecessor_id:input.predecessor_stage_id,successor_id:input.successor_stage_id,
        type:input.type,lag_days:input.lag_days,
      }) as unknown as QuoteStageDependency;
    },
    onSettled: () => {
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
      await changeGanttDependency("quote",quoteId,"delete",{id});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}
