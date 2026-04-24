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
