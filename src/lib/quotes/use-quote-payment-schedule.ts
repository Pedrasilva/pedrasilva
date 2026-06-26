/**
 * Planned (forecast) payment schedule items for a quote.
 * Not invoices — those are pm_invoices once a project exists.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  QuotePaymentScheduleItem,
  QuotePaymentTrigger,
  QuotePaymentAmountType,
} from "./types";
import type { GeneratorItem, GeneratorKind } from "./payment-generators";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QuotePaymentItemInsert = {
  quote_id: string;
  label: string;
  trigger_type: QuotePaymentTrigger;
  amount_type: QuotePaymentAmountType;
  amount_value: number;
  stage_id?: string | null;
  expected_invoice_date?: string | null;
  expected_payment_date?: string | null;
  sort_order?: number;
  notes?: string | null;
  manual_override?: boolean;
  generator_source?: string | null;
  direction?: "inflow" | "outflow";
  supplier_company_id?: string | null;
  supplier_id?: string | null;
  supplier_label?: string | null;
  linked_payment_item_id?: string | null;
  payment_offset_days?: number;
  vat_rate?: number;
  vat_rate_override?: boolean;
  payment_terms?: string | null;
};

export type QuotePaymentItemUpdate = Partial<QuotePaymentItemInsert> & {
  id: string;
};

export function useQuotePaymentSchedule(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-payment-schedule", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<QuotePaymentScheduleItem[]> => {
      const { data, error } = await db
        .from("quote_payment_schedule_items")
        .select("*")
        .eq("quote_id", quoteId!)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as QuotePaymentScheduleItem[];
    },
  });
}

export function useUpsertQuotePaymentItem(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuotePaymentItemInsert | QuotePaymentItemUpdate) => {
      if ("id" in input && input.id) {
        const { id, ...rest } = input;
        const { data, error } = await db
          .from("quote_payment_schedule_items")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as QuotePaymentScheduleItem;
      }
      const { data, error } = await db
        .from("quote_payment_schedule_items")
        .insert({ ...input, quote_id: quoteId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as QuotePaymentScheduleItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-payment-schedule", quoteId] });
    },
  });
}

export function useDeleteQuotePaymentItem(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("quote_payment_schedule_items")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-payment-schedule", quoteId] });
    },
  });
}

/**
 * Apply a generator: deletes all existing items from the same generator_source
 * (or all non-manual items if `replaceAll`), then inserts the new generated rows.
 * Items with `manual_override = true` are NEVER touched.
 */
export function useApplyPaymentGenerator(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      generator: GeneratorKind;
      items: GeneratorItem[];
      replaceAll?: boolean;
    }) => {
      // 1) Determine which existing items to delete.
      const filter = db
        .from("quote_payment_schedule_items")
        .delete()
        .eq("quote_id", quoteId)
        .or("manual_override.is.null,manual_override.eq.false");

      if (!input.replaceAll) {
        filter.eq("generator_source", input.generator);
      }

      const { error: delError } = await filter;
      if (delError) throw new Error(delError.message);

      // 2) Find next sort_order base after preserved items.
      const { data: preserved, error: selError } = await db
        .from("quote_payment_schedule_items")
        .select("sort_order")
        .eq("quote_id", quoteId)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (selError) throw new Error(selError.message);
      const base =
        preserved && preserved.length > 0 ? Number(preserved[0].sort_order) + 1 : 0;

      // 3) Insert new rows.
      if (input.items.length === 0) return [];
      const rows = input.items.map((it, i) => ({
        quote_id: quoteId,
        label: it.label,
        trigger_type: it.trigger_type,
        amount_type: it.amount_type,
        amount_value: it.amount_value,
        stage_id: it.stage_id,
        expected_invoice_date: it.expected_invoice_date,
        expected_payment_date: it.expected_payment_date,
        sort_order: base + i,
        generator_source: it.generator_source,
        manual_override: false,
        direction: it.direction ?? "inflow",
        supplier_company_id: it.supplier_company_id ?? null,
        supplier_id: it.supplier_id ?? null,
        supplier_label: it.supplier_label ?? null,
        vat_rate: it.vat_rate ?? 23,
        payment_terms: it.payment_terms ?? null,
      }));
      const { data, error } = await db
        .from("quote_payment_schedule_items")
        .insert(rows)
        .select();
      if (error) throw new Error(error.message);
      return data as QuotePaymentScheduleItem[];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-payment-schedule", quoteId] });
    },
  });
}
