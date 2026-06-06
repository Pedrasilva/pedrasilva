/**
 * Planner adapter — the single contract Gantt + AllocationEditor +
 * StageDependencyEditor talk to. Lets the same components drive either
 * project-mode (pm_* tables) or quote-mode (quote_* tables) without
 * forking the Gantt component.
 *
 * - Mutation handlers normalize the call signature: they accept
 *   `{ id, projectId, ... }` where `projectId` is whatever scoping ID the
 *   underlying mode needs (real project id for project mode, quote id for
 *   quote mode). The Gantt code never inspects this value.
 * - Dependencies are normalized to {predecessor_id, successor_id, type,
 *   lag_days, id} regardless of underlying column names.
 * - `features` flags drive what the Gantt renders (baseline ghost, leave
 *   overlap, overload, allocation status toggle, cross-project DnD).
 */
import type { DepType, StageDependency } from "@/lib/projects/dependencies";
import type { Resource } from "@/lib/projects/types";
import type { DefaultRateInfo } from "@/lib/projects/use-default-rates";

export type PlannerMode = "project" | "quote";

export interface PlannerFeatures {
  /** Show baseline ghost bar + StageBaselineDialog button on stage rows. */
  baseline: boolean;
  /** Show approved-leave overlap badge on allocation bars. */
  leave: boolean;
  /** Show capacity-overload badge / ring on allocation bars. */
  overload: boolean;
  /** Show tentative/committed status toggle in AllocationEditor. */
  statusToggle: boolean;
  /** Allow dragging an allocation between stages of different projects. */
  crossProjectMove: boolean;
  /** Show holiday shading on the timeline background. */
  holidayShading: boolean;
  /** Allocation editor exposes an allocation % field that drives hours/day. */
  allocationPercentage: boolean;
  /**
   * Planning mode: stage bar compares cost vs sale value (not vs budget),
   * and the financials info button is always visible. Used by quote planning
   * where "budget" is what's being calculated, not a ceiling to enforce.
   */
  planningMode: boolean;
}

export interface PlannerStageUpdateArgs {
  id: string;
  projectId: string;
  start_date: string;
  end_date: string;
}

export interface PlannerStageDeleteArgs {
  id: string;
  projectId: string;
}

export interface PlannerAllocationCreateArgs {
  stage_id: string;
  resource_id: string;
  start_date: string;
  end_date: string;
  hours_per_day: number;
  projectId: string;
}

export interface PlannerAllocationUpdateArgs {
  id: string;
  projectId: string;
  patch: {
    start_date?: string;
    end_date?: string;
    hours_per_day?: number;
    stage_id?: string;
    status?: "tentative" | "committed";
    allocation_percentage?: number | null;
  };
}

export interface PlannerAllocationDeleteArgs {
  id: string;
  projectId: string;
}

export interface PlannerAllocationStatusArgs {
  id: string;
  projectId: string;
  status: "tentative" | "committed";
}

export interface PlannerDependencyCreateArgs {
  predecessor_id: string;
  successor_id: string;
  type?: DepType;
  lag_days?: number;
}

export interface PlannerDependencyUpdateArgs {
  id: string;
  patch: { type?: DepType; lag_days?: number };
}

/** Pending flags exposed to children so they can disable buttons. */
export interface PlannerPending {
  stage: boolean;
  allocation: boolean;
  dependency: boolean;
}

export interface PlannerAdapter {
  mode: PlannerMode;
  /**
   * Dependencies in the canonical {predecessor_id, successor_id, type,
   * lag_days, id} shape. Quote mode renames its underlying columns.
   */
  dependencies: StageDependency[];
  /** Default resource-rate overrides (used for cost colorization in project mode). */
  defaultRates: Map<string, DefaultRateInfo> | undefined;
  /** Active resources, used by drag-from-pool create flow. */
  resources: Resource[];

  // ---- mutations ----
  updateStage: (args: PlannerStageUpdateArgs) => Promise<unknown>;
  deleteStage: (args: PlannerStageDeleteArgs) => Promise<unknown>;
  createAllocation: (args: PlannerAllocationCreateArgs) => Promise<unknown>;
  updateAllocation: (args: PlannerAllocationUpdateArgs) => Promise<unknown>;
  deleteAllocation: (args: PlannerAllocationDeleteArgs) => Promise<unknown>;
  setAllocationStatus?: (args: PlannerAllocationStatusArgs) => Promise<unknown>;
  createDependency: (args: PlannerDependencyCreateArgs) => Promise<unknown>;
  updateDependency?: (args: PlannerDependencyUpdateArgs) => Promise<unknown>;
  deleteDependency: (id: string) => Promise<unknown>;

  pending: PlannerPending;
  features: PlannerFeatures;
}

export const PROJECT_FEATURES: PlannerFeatures = {
  baseline: true,
  leave: true,
  overload: true,
  statusToggle: true,
  crossProjectMove: true,
  holidayShading: true,
  allocationPercentage: true,
  planningMode: false,
};

export const QUOTE_FEATURES: PlannerFeatures = {
  baseline: false,
  leave: false,
  overload: false,
  statusToggle: false,
  crossProjectMove: false,
  holidayShading: false,
  allocationPercentage: true,
  planningMode: true,
};
