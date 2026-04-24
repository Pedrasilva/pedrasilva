/**
 * Quote-owned external services (consultants/subcontracts on a fee proposal).
 * Mirrors pm_materials behaviour. The DB trigger
 * quote_external_services_compute_sale_price() handles auto sale_price.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  QuoteExternalService,
  QuoteExternalServiceStatus,
  QuoteMarkupType,
} from "./types";
import type { Supplier } from "@/lib/projects/use-suppliers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QuoteExternalServiceWithSupplier = QuoteExternalService & {
  supplier: Pick<Supplier, "id" | "name" | "active"> | null;
};

export type QuoteExternalServiceInsert = {
  quote_id: string;
  description: string;
  stage_id?: string | null;
  supplier_id?: string | null;
  quantity?: number;
  unit_cost?: number;
  purchase_price?: number;
  markup_type?: QuoteMarkupType;
  markup_value?: number;
  sale_price?: number;
  sale_price_manual?: boolean;
  status?: QuoteExternalServiceStatus;
  notes?: string | null;
};

export type QuoteExternalServiceUpdate = Partial<QuoteExternalServiceInsert> & {
  id: string;
};

export function useQuoteExternalServices(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-external-services", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<QuoteExternalServiceWithSupplier[]> => {
      const { data, error } = await db
        .from("quote_external_services")
        .select("*, supplier:pm_suppliers(id,name,active)")
        .eq("quote_id", quoteId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as QuoteExternalServiceWithSupplier[];
    },
  });
}

export function useUpsertQuoteExternalService(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: QuoteExternalServiceInsert | QuoteExternalServiceUpdate,
    ) => {
      if ("id" in input && input.id) {
        const { id, ...rest } = input;
        const { data, error } = await db
          .from("quote_external_services")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as QuoteExternalService;
      }
      const { data, error } = await db
        .from("quote_external_services")
        .insert({ ...input, quote_id: quoteId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as QuoteExternalService;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-external-services", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}

export function useDeleteQuoteExternalService(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("quote_external_services")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-external-services", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}
