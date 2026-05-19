/**
 * Stage 6C — Forecast & capacity engine types.
 *
 * Pure deterministic computation. Inputs are plain rows;
 * outputs are plain numeric envelopes. No I/O, no React.
 */
import type { Database } from "@/integrations/supabase/types";

export type AllocationRow =
  Database["public"]["Tables"]["pm_allocations"]["Row"];
export type StageRow = Database["public"]["Tables"]["pm_stages"]["Row"];
export type ResourceRow = Database["public"]["Tables"]["pm_resources"]["Row"];
export type StageBaselineRow =
  Database["public"]["Tables"]["pm_stage_commercial_baselines"]["Row"];
export type ProjectBaselineRow =
  Database["public"]["Tables"]["pm_project_commercial_baselines"]["Row"];
export type PlaceholderRow =
  Database["public"]["Tables"]["pm_stage_allocation_placeholders"]["Row"];
export type ForecastRow =
  Database["public"]["Tables"]["pm_resource_allocations_forecast"]["Row"];

export type CapacityRiskLevel = "low" | "medium" | "high";

export interface DailyForecastPoint {
  project_id: string;
  project_stage_id: string;
  allocation_id: string;
  resource_id: string;
  collaborator_id: string | null;
  allocation_date: string; // YYYY-MM-DD
  allocated_hours: number;
}

export interface StageCoverage {
  project_stage_id: string;
  planned_hours: number;
  allocated_hours: number;
  remaining_hours: number;
  staffing_coverage_pct: number;
  over_allocated: boolean;
}

export interface StageRecoverability {
  project_stage_id: string;
  sold_fee: number;
  planned_cost: number;
  planned_margin: number;
  planned_margin_pct: number | null;
  recoverability_pct: number | null;
}

export interface CollaboratorCapacity {
  resource_id: string;
  collaborator_id: string | null;
  capacity_hours: number;       // FTE × business days × chargeability
  allocated_hours: number;      // sum of forecast hours in window
  utilization_pct: number;      // allocated / capacity
  overloaded: boolean;
}

export interface ProjectForecastMetrics {
  project_id: string;
  planned_fee: number;
  forecast_fee: number;
  planned_cost: number;
  forecast_cost: number;
  planned_margin_pct: number | null;
  forecast_margin_pct: number | null;
  allocated_hours: number;
  remaining_hours: number;
  staffing_coverage_pct: number;
  capacity_risk_level: CapacityRiskLevel;
}

export const FORECAST_RESOLVER_VERSION = "forecasting.v1" as const;
