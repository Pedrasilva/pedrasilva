/**
 * Contract baseline (immutable snapshot of what was agreed at quote→project
 * conversion). Pure-read; written only by the convert handler.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type ContractBaseline = {
  id: string;
  project_id: string;
  quote_id: string | null;
  snapshot_at: string;
  total_fee: number | null;
  total_internal_fee: number | null;
  total_external_fee: number | null;
  pricing_multiplier: number | null;
  quote_title: string | null;
  quote_number: string | null;
  notes: string | null;
};

export type ContractBaselineStage = {
  id: string;
  baseline_id: string;
  name: string;
  parent_name: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  billing_model: string | null;
  stage_kind: string | null;
  sort_order: number;
};

export type ContractBaselinePayment = {
  id: string;
  baseline_id: string;
  label: string;
  trigger_type: string | null;
  amount: number | null;
  expected_invoice_date: string | null;
  expected_payment_date: string | null;
  stage_name: string | null;
  sort_order: number;
};

export function useContractBaseline(projectId: string | undefined) {
  return useQuery({
    queryKey: ["pm-contract-baseline", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<{
      header: ContractBaseline;
      stages: ContractBaselineStage[];
      payments: ContractBaselinePayment[];
    } | null> => {
      const { data: header, error } = await db
        .from("pm_project_contract_baseline")
        .select("*")
        .eq("project_id", projectId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!header) return null;

      const [{ data: stages }, { data: payments }] = await Promise.all([
        db
          .from("pm_project_contract_baseline_stages")
          .select("*")
          .eq("baseline_id", header.id)
          .order("sort_order", { ascending: true }),
        db
          .from("pm_project_contract_baseline_payments")
          .select("*")
          .eq("baseline_id", header.id)
          .order("sort_order", { ascending: true }),
      ]);

      return {
        header: header as ContractBaseline,
        stages: (stages ?? []) as ContractBaselineStage[],
        payments: (payments ?? []) as ContractBaselinePayment[],
      };
    },
  });
}
