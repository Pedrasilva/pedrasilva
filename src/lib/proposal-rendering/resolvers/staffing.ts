/**
 * Proposal staffing resolvers.
 *
 * These helpers exist so future proposal/ontology blocks can render phase
 * metadata WITHOUT exposing collaborator names. They read from the existing
 * planning data (quote/pm allocations + pm_resources) and aggregate by
 * `proposal_role`.
 *
 * Currently UNWIRED — the existing proposal generator and UI are not
 * changed. Wire from a future ontology block.
 */

import {
  aggregateAllocationsByProposalRole,
  type AggregatableAllocation,
  type AggregatableResource,
  type RoleAllocationSummary,
} from "@/lib/proposal-roles";

export interface PhaseDuration {
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
}

export interface StaffingResolverContext {
  /** All allocations for the phase (quote_allocations or pm_allocations). */
  allocations: ReadonlyArray<
    AggregatableAllocation & { stage_id?: string | null }
  >;
  /** Resource catalog. */
  resources: ReadonlyArray<AggregatableResource>;
  /** Stage windows belonging to the phase, used for duration. */
  stages?: ReadonlyArray<{
    id: string;
    start_date?: string | null;
    end_date?: string | null;
  }>;
}

export function resolvePhaseDuration(ctx: StaffingResolverContext): PhaseDuration {
  const stages = ctx.stages ?? [];
  const starts = stages
    .map((s) => s.start_date)
    .filter((d): d is string => !!d)
    .sort();
  const ends = stages
    .map((s) => s.end_date)
    .filter((d): d is string => !!d)
    .sort();
  const startDate = starts[0] ?? null;
  const endDate = ends[ends.length - 1] ?? null;
  let weeks: number | null = null;
  if (startDate && endDate) {
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
    weeks = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24 * 7)));
  }
  return { startDate, endDate, weeks };
}

export function resolvePhaseEstimatedHours(
  ctx: StaffingResolverContext,
): number {
  return Number(
    ctx.allocations
      .reduce((sum, a) => sum + Number(a.hours ?? 0), 0)
      .toFixed(2),
  );
}

export function resolvePhaseStaffingMix(
  ctx: StaffingResolverContext,
): RoleAllocationSummary[] {
  return aggregateAllocationsByProposalRole(ctx.allocations, ctx.resources);
}
