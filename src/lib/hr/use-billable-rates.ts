import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared "Billable hourly rates" table.
 *
 * - Roles are the distinct HR `collaborators.billing_role` values.
 * - Cost per role lives in `billable_hourly_rates` (single source of truth,
 *   shared across HR settings and every quote).
 * - The per-quote manual sale rate lives in `quote_billable_hourly_rates`
 *   (see `useQuoteSaleRates`), and is quote-specific by design.
 */

export type BillableRateRow = {
  id: string;
  role_name: string;
  hourly_rate: number;
};

export function useBillingRoles() {
  return useQuery({
    queryKey: ["billing-roles"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("billing_role")
        .is("archived_at", null)
        .not("billing_role", "is", null);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (data ?? []) as { billing_role: string | null }[]) {
        const v = (r.billing_role ?? "").trim();
        if (v) set.add(v);
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b, "pt"));
    },
  });
}

export function useBillableRates() {
  return useQuery({
    queryKey: ["billable-hourly-rates"],
    queryFn: async (): Promise<BillableRateRow[]> => {
      const { data, error } = await supabase
        .from("billable_hourly_rates")
        .select("id, role_name, hourly_rate");
      if (error) throw error;
      return (data ?? []) as BillableRateRow[];
    },
  });
}

export function useUpsertBillableRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { role_name: string; hourly_rate: number }) => {
      const { error } = await supabase
        .from("billable_hourly_rates")
        .upsert(
          { role_name: input.role_name, hourly_rate: input.hourly_rate },
          { onConflict: "role_name" },
        );
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["billable-hourly-rates"] }),
  });
}

export type QuoteSaleRateRow = {
  id: string;
  quote_id: string;
  role_name: string;
  sale_rate: number;
};

export function useQuoteSaleRates(quoteId: string) {
  return useQuery({
    queryKey: ["quote-sale-rates", quoteId],
    queryFn: async (): Promise<QuoteSaleRateRow[]> => {
      const { data, error } = await supabase
        .from("quote_billable_hourly_rates")
        .select("id, quote_id, role_name, sale_rate")
        .eq("quote_id", quoteId);
      if (error) throw error;
      return (data ?? []) as QuoteSaleRateRow[];
    },
  });
}

export function useUpsertQuoteSaleRate(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { role_name: string; sale_rate: number }) => {
      const { error } = await supabase
        .from("quote_billable_hourly_rates")
        .upsert(
          {
            quote_id: quoteId,
            role_name: input.role_name,
            sale_rate: input.sale_rate,
          },
          { onConflict: "quote_id,role_name" },
        );
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["quote-sale-rates", quoteId] }),
  });
}
