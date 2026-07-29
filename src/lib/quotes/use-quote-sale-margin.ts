/**
 * Per-quote sale margin.
 *
 * Project rule: the default sale margin is a 50% markup on cost
 * (see `DEFAULT_SALE_MARGIN_PCT`). Some clients justify a different
 * commercial margin, so each quote can store its own override in
 * `fee_proposals.sale_margin_pct` (stored as a fraction, e.g. 0.35 = 35%).
 *
 * When set, resource sale rates on the planning chart are derived as
 * `cost × (1 + margin)` instead of the HR-derived sale rate.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SALE_MARGIN_PCT } from "@/lib/quotes/use-resource-pricing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const quoteSaleMarginKey = (quoteId: string) => ["quote-sale-margin", quoteId];

export function useQuoteSaleMargin(quoteId: string) {
  return useQuery({
    queryKey: quoteSaleMarginKey(quoteId),
    enabled: !!quoteId,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await db
        .from("fee_proposals")
        .select("sale_margin_pct")
        .eq("id", quoteId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const v = (data as { sale_margin_pct: number | null } | null)?.sale_margin_pct;
      return v == null ? null : Number(v);
    },
  });
}

/** Resolve the margin actually used for pricing (override → project default). */
export function resolveSaleMargin(margin: number | null | undefined): number {
  return margin == null || !Number.isFinite(margin) ? DEFAULT_SALE_MARGIN_PCT : margin;
}

/** Apply a margin to a cost rate; falls back to the HR sale rate when cost is 0. */
export function saleFromCost(
  cost: number,
  hrSale: number,
  margin: number | null | undefined,
): number {
  if (margin == null) return hrSale;
  if (!cost || cost <= 0) return hrSale;
  return cost * (1 + margin);
}

export function useSetQuoteSaleMargin(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      /** Fraction (0.5 = 50%). `null` resets to the project default. */
      marginPct: number | null;
      /** Re-price existing allocations on this quote from their cost snapshot. */
      applyToExisting: boolean;
    }) => {
      const { error } = await db
        .from("fee_proposals")
        .update({ sale_margin_pct: input.marginPct })
        .eq("id", quoteId);
      if (error) throw new Error(error.message);

      if (input.applyToExisting) {
        const margin = resolveSaleMargin(input.marginPct);
        const { data: allocs, error: readErr } = await db
          .from("quote_allocations")
          .select("id, cost_rate_snapshot")
          .eq("quote_id", quoteId);
        if (readErr) throw new Error(readErr.message);
        const rows = (allocs ?? []) as { id: string; cost_rate_snapshot: number | null }[];
        await Promise.all(
          rows
            .filter((r) => Number(r.cost_rate_snapshot) > 0)
            .map((r) =>
              db
                .from("quote_allocations")
                .update({
                  sale_rate_snapshot: Number(r.cost_rate_snapshot) * (1 + margin),
                })
                .eq("id", r.id),
            ),
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quoteSaleMarginKey(quoteId) });
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-payment-schedule", quoteId] });
    },
  });
}
