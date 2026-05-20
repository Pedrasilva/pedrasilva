import type {
  AggregatableAllocation,
  AggregatableResource,
  RoleAllocationSummary,
} from "./types";
import { UNASSIGNED_PROPOSAL_ROLE } from "./types";

/**
 * Pure aggregator: collapses a list of allocations into hour totals grouped by
 * the proposal_role of their resource. Resources without a proposal_role are
 * bucketed under UNASSIGNED_PROPOSAL_ROLE — caller decides how to render that
 * (typically `t("glossary:proposalRole.unassigned")`).
 *
 * Never exposes collaborator/resource names.
 */
export function aggregateAllocationsByProposalRole(
  allocations: ReadonlyArray<AggregatableAllocation>,
  resources: ReadonlyArray<AggregatableResource>,
): RoleAllocationSummary[] {
  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const buckets = new Map<
    string,
    { hours: number; resources: Set<string> }
  >();

  for (const alloc of allocations) {
    if (!alloc.resource_id) continue;
    const resource = resourceById.get(alloc.resource_id);
    const key =
      (resource?.proposal_role ?? "").trim() || UNASSIGNED_PROPOSAL_ROLE;
    const bucket = buckets.get(key) ?? { hours: 0, resources: new Set() };
    bucket.hours += Number(alloc.hours ?? 0);
    bucket.resources.add(alloc.resource_id);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([key, value]) => ({
      role: key === UNASSIGNED_PROPOSAL_ROLE ? null : key,
      hours: Number(value.hours.toFixed(2)),
      resourceCount: value.resources.size,
    }))
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Convenience wrapper for a stage. Caller pre-filters allocations to the stage.
 */
export function aggregateStageAllocationsByProposalRole(
  stageAllocations: ReadonlyArray<AggregatableAllocation>,
  resources: ReadonlyArray<AggregatableResource>,
): RoleAllocationSummary[] {
  return aggregateAllocationsByProposalRole(stageAllocations, resources);
}

/**
 * Convenience wrapper for a phase (a group of stages). Caller pre-filters
 * allocations to the phase.
 */
export function aggregatePhaseAllocationsByProposalRole(
  phaseAllocations: ReadonlyArray<AggregatableAllocation>,
  resources: ReadonlyArray<AggregatableResource>,
): RoleAllocationSummary[] {
  return aggregateAllocationsByProposalRole(phaseAllocations, resources);
}
