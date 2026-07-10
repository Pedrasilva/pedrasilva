/**
 * Log / edit / delete an hour entry against a fee-only retainer stage.
 *
 * Resolves the current user's pm_resources row (via the existing
 * `pm_get_my_resource_id` RPC) and snapshots cost / sale rates onto the
 * entry so the monthly readings remain stable when rates change.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LogRetainerHoursInput {
  stage_id: string;
  user_id: string;
  entry_date: string; // ISO yyyy-mm-dd
  hours: number;
  billable: boolean;
  notes?: string | null;
  /** Optional — provide when editing an existing entry. */
  entry_id?: string | null;
}

export function useLogRetainerHours(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogRetainerHoursInput) => {
      // Resolve current user's resource → cost rate for snapshot.
      const { data: resourceId, error: rErr } = await supabase.rpc("pm_get_my_resource_id");
      if (rErr) throw rErr;
      let cost = 0;
      if (resourceId) {
        const { data: res } = await supabase
          .from("pm_resources")
          .select("cost_rate")
          .eq("id", resourceId as string)
          .maybeSingle();
        cost = Number((res as { cost_rate: number | null } | null)?.cost_rate ?? 0);
      }

      // Retainers are subscriptions: hours logged against a retainer stage
      // are always billable, and the sale rate is derived from the stage's
      // fixed monthly fee ÷ included hours (fee/capacity). This detaches
      // retainer readings from per-resource sale rates so €0-because-non-
      // billable never happens.
      const { data: stage } = await supabase
        .from("pm_stages")
        .select("retainer_monthly_amount, retainer_capacity_hours_per_month")
        .eq("id", input.stage_id)
        .maybeSingle();
      const monthlyFee = Number(
        (stage as { retainer_monthly_amount: number | null } | null)
          ?.retainer_monthly_amount ?? 0,
      );
      const capacityHpm = Number(
        (stage as { retainer_capacity_hours_per_month: number | null } | null)
          ?.retainer_capacity_hours_per_month ?? 0,
      );
      const derivedSale = capacityHpm > 0 ? monthlyFee / capacityHpm : 0;

      // Force billable=true — retainer hours are always billable under
      // the subscription fee.
      const billable = true;

      if (input.entry_id) {
        const { error } = await supabase
          .from("pm_time_entries")
          .update({
            entry_date: input.entry_date,
            hours: input.hours,
            billable,
            notes: input.notes ?? null,
            cost_rate_snapshot: cost,
            sale_rate_snapshot: derivedSale,
          } as never)
          .eq("id", input.entry_id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("pm_time_entries").insert({
        entry_type: "retainer",
        quote_stage_id: input.stage_id,
        user_id: input.user_id,
        entry_date: input.entry_date,
        hours: input.hours,
        billable,
        notes: input.notes ?? null,
        source: "retainer-inline",
        cost_rate_snapshot: cost,
        sale_rate_snapshot: derivedSale,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["retainer-monthly-actuals"] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}

export function useDeleteRetainerEntry(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["retainer-monthly-actuals"] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });
}
