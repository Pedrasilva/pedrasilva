/**
 * Live plan + billing data needed by the "Compare to contract" diff view.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LivePaymentItem, LiveStage } from "@/lib/projects/contract-diff";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useLivePlanForDiff(projectId: string | undefined) {
  return useQuery({
    queryKey: ["pm-live-plan-for-diff", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<{ stages: LiveStage[]; payments: LivePaymentItem[] }> => {
      const [{ data: stages, error: sErr }, { data: payments, error: pErr }] =
        await Promise.all([
          db
            .from("pm_stages")
            .select("id, name, parent_stage_id, start_date, end_date, budget, sort_order")
            .eq("project_id", projectId!)
            .is("archived_at", null)
            .order("sort_order", { ascending: true }),
          db
            .from("pm_payment_schedule_items")
            .select("id, label, stage_id, amount_value, expected_invoice_date, billing_status")
            .eq("project_id", projectId!)
            .order("sort_order", { ascending: true }),
        ]);
      if (sErr) throw new Error(sErr.message);
      if (pErr) throw new Error(pErr.message);
      return {
        stages: (stages ?? []) as LiveStage[],
        payments: (payments ?? []) as LivePaymentItem[],
      };
    },
  });
}
