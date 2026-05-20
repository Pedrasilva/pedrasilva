/**
 * Proposal-facing role abstraction.
 *
 * Internal planning uses real named collaborators / pm_resources.
 * Proposal output MUST aggregate by proposal_role and never expose names.
 *
 * This module is the single source of truth for that mapping.
 */

export type ProposalRoleCode =
  | "partner"
  | "director"
  | "senior_architect"
  | "architect"
  | "junior_architect"
  | "bim_coordinator"
  | "interior_architect"
  | "technical_coordinator"
  | (string & {});

export interface ProposalRole {
  id: string;
  code: ProposalRoleCode;
  label_en: string;
  label_pt: string;
  default_seniority: number | null;
  sort_order: number;
  archived_at: string | null;
}

/** Aggregated allocation summary by proposal role. Never carries names. */
export interface RoleAllocationSummary {
  /** Canonical role label as stored on the resource. `null` for unassigned. */
  role: string | null;
  /** Hours summed across all resources mapped to this role. */
  hours: number;
  /** Number of distinct resources contributing to this bucket. */
  resourceCount: number;
}

/** Minimal resource shape required by the aggregator. */
export interface AggregatableResource {
  id: string;
  proposal_role: string | null;
}

/** Minimal allocation shape required by the aggregator. */
export interface AggregatableAllocation {
  resource_id: string | null;
  hours: number | null;
}

export const UNASSIGNED_PROPOSAL_ROLE = "__unassigned__";
