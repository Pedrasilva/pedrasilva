/**
 * Stage 6B — Commercial baseline & allocation placeholder types.
 */
import type { Database } from "@/integrations/supabase/types";

export type PhaseClass =
  | "finite"
  | "operational_recurring"
  | "parallel_addon"
  | "support_only";

export type DeliveryMode = "internal" | "external" | "mixed" | null;

export type AllocationPlaceholderSource =
  Database["public"]["Enums"]["pm_allocation_placeholder_source"];

export interface ProjectCommercialBaselineInput {
  sold_fee_total: number | null;
  sold_internal_fee: number | null;
  sold_external_fee: number | null;
  sold_consultant_fee: number | null;
  sold_reimbursable_allowance: number | null;
  target_chargeability_pct: number | null;
  target_recoverability_pct: number | null;
  target_gross_margin_pct: number | null;
  planned_duration_weeks: number | null;
  planned_construction_months: number | null;
  baseline_json: Record<string, unknown>;
}

export interface StageCommercialBaselineInput {
  /** Filled by apply step once the pm_stage id is known. */
  project_stage_id: string;
  source_contract_phase_key: string;
  sold_fee: number | null;
  estimated_hours: number | null;
  estimated_internal_cost: number | null;
  estimated_external_cost: number | null;
  target_margin_pct: number | null;
  target_recoverability_pct: number | null;
  delivery_mode: DeliveryMode;
  phase_class: PhaseClass;
  baseline_json: Record<string, unknown>;
}

export interface StageAllocationPlaceholderInput {
  /** Filled by apply step once the pm_stage id is known. */
  project_stage_id: string;
  source_contract_phase_key: string;
  discipline: string | null;
  role: string | null;
  expected_hours: number | null;
  expected_fte: number | null;
  expected_duration_weeks: number | null;
  source: AllocationPlaceholderSource;
  confidence_pct: number | null;
}

export type ProjectCommercialBaselineRow =
  Database["public"]["Tables"]["pm_project_commercial_baselines"]["Row"];
export type StageCommercialBaselineRow =
  Database["public"]["Tables"]["pm_stage_commercial_baselines"]["Row"];
export type StageAllocationPlaceholderRow =
  Database["public"]["Tables"]["pm_stage_allocation_placeholders"]["Row"];
