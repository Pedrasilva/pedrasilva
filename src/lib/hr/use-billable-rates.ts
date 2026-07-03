import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { proposalRoleKeys } from "@/lib/proposal-roles";

/**
 * Billable hourly rates.
 *
 * - Cost per role is stored on the `proposal_roles` catalog (single source
 *   of truth, admin at /admin/proposal-roles).
 * - The per-quote "Manual sale rate" lives in `quote_billable_hourly_rates`,
 *   keyed by role code.
 */

export type QuoteSaleRateRow = {
  id: string;
  quote_id: string;
  role_name: string; // stores proposal_roles.code
  sale_rate: number;
};

export function useUpsertProposalRoleCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; hourly_rate: number }) => {
      const { error } = await supabase
        .from("proposal_roles")
        .update({ hourly_rate: input.hourly_rate })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: proposalRoleKeys.all }),
  });
}

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
    mutationFn: async (input: { role_code: string; sale_rate: number }) => {
      const { error } = await supabase
        .from("quote_billable_hourly_rates")
        .upsert(
          {
            quote_id: quoteId,
            role_name: input.role_code,
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
