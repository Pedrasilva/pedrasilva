import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteStageDependency, QuoteDepType } from "./types";

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
      return data as QuoteStageDependency;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
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
