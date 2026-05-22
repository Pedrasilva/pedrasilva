/**
 * Quote-owned allocations. Rates are snapshotted at insert time so historical
 * revisions remain accurate even when pm_resource_rates change.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteAllocation } from "./types";
import type { Resource } from "@/lib/projects/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QuoteAllocationWithResource = QuoteAllocation & {
  resource:
    | (Pick<Resource, "id" | "name" | "color"> & {
        role?: string | null;
        proposal_role?: string | null;
      })
    | null;
};


export type QuoteAllocationInsert = {
  quote_id: string;
  stage_id: string;
  resource_id: string;
  start_date: string;
  end_date: string;
  hours_per_day?: number;
  allocation_percentage?: number | null;
  cost_rate_snapshot: number;
  sale_rate_snapshot: number;
  notes?: string | null;
};

export type QuoteAllocationUpdate = Partial<QuoteAllocationInsert> & { id: string };

export function useQuoteAllocations(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-allocations", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<QuoteAllocationWithResource[]> => {
      const { data, error } = await db
        .from("quote_allocations")
        .select("*, resource:pm_resources(id,name,color,role,proposal_role)")
        .eq("quote_id", quoteId!)
        .order("start_date", { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as QuoteAllocationWithResource[];
    },
  });
}

export function useUpsertQuoteAllocation(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteAllocationInsert | QuoteAllocationUpdate) => {
      if ("id" in input && input.id) {
        const { id, ...rest } = input;
        const { data, error } = await db
          .from("quote_allocations")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as QuoteAllocation;
      }
      const { data, error } = await db
        .from("quote_allocations")
        .insert({ ...input, quote_id: quoteId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as QuoteAllocation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}

export function useDeleteQuoteAllocation(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("quote_allocations").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}
