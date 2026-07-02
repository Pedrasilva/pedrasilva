/**
 * Per-supplier administration markup on a quote (fee proposal).
 *
 * The user lists suppliers in the quote settings and assigns each an
 * administration markup percentage. The percentage inflates client-billed
 * supplier prices only; supplier costs (what we pay them) stay untouched.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SupplierMarkupRow } from "./supplier-markup-lookup";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface QuoteSupplierMarkup extends SupplierMarkupRow {
  id: string;
  quote_id: string;
  markup_pct: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteSupplierMarkupUpsert {
  quote_id: string;
  supplier_company_id?: string | null;
  supplier_id?: string | null;
  supplier_label?: string | null;
  markup_pct: number;
}

export function useQuoteSupplierMarkups(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-supplier-markups", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<QuoteSupplierMarkup[]> => {
      const { data, error } = await db
        .from("quote_supplier_markups")
        .select("*")
        .eq("quote_id", quoteId!);
      if (error) throw new Error(error.message);
      return ((data ?? []) as QuoteSupplierMarkup[]).map((r) => ({
        ...r,
        markup_pct: Number(r.markup_pct) || 0,
      }));
    },
  });
}

/**
 * Insert-or-update a supplier markup row. Matching is done on the SAME
 * identity used at read time (company id → supplier id → label) so we
 * don't create duplicates.
 */
export function useUpsertQuoteSupplierMarkup(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteSupplierMarkupUpsert) => {
      const label = (input.supplier_label ?? "").trim() || null;
      const supplierCompanyId = input.supplier_company_id ?? null;
      const supplierId = input.supplier_id ?? null;

      let existingQ = db
        .from("quote_supplier_markups")
        .select("id")
        .eq("quote_id", input.quote_id);
      if (supplierCompanyId) {
        existingQ = existingQ.eq("supplier_company_id", supplierCompanyId);
      } else if (supplierId) {
        existingQ = existingQ
          .is("supplier_company_id", null)
          .eq("supplier_id", supplierId);
      } else if (label) {
        existingQ = existingQ
          .is("supplier_company_id", null)
          .is("supplier_id", null)
          .ilike("supplier_label", label);
      } else {
        throw new Error("Supplier markup requires a supplier identity.");
      }
      const { data: existing, error: findError } = await existingQ.maybeSingle();
      if (findError) throw new Error(findError.message);

      if (existing?.id) {
        const { data, error } = await db
          .from("quote_supplier_markups")
          .update({ markup_pct: input.markup_pct })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as QuoteSupplierMarkup;
      }
      const { data, error } = await db
        .from("quote_supplier_markups")
        .insert({
          quote_id: input.quote_id,
          supplier_company_id: supplierCompanyId,
          supplier_id: supplierCompanyId ? null : supplierId,
          supplier_label:
            supplierCompanyId || supplierId ? null : label,
          markup_pct: input.markup_pct,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as QuoteSupplierMarkup;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-supplier-markups", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-payment-schedule", quoteId] });
      qc.invalidateQueries({ queryKey: ["psa-live-quote", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee-proposal-summary", quoteId] });
    },
  });
}
