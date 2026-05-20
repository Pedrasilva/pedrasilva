/**
 * Public surface of the ontology-aware proposal rendering layer (Milestone 4).
 *
 * ADDITIVE ONLY. Existing builder, blocks, document editor, drag/drop, fee
 * calculation, payment generation, Gantt and quote conversion remain
 * unchanged. Legacy proposals without ontology metadata skip this pipeline
 * entirely (resolvers return `applied: false`).
 */
export type {
  Locale,
  ProposalRenderKind,
  RenderTokens,
  RenderContext,
  ResolvedSection,
  SectionId,
  ResolvedPhaseNarrative,
  ResolvedClause,
  ClauseCode,
  ResolvedCoverPage,
  ResolvedCoverLetter,
  ResolvedCommercialNote,
  ResolvedProposalView,
} from "./types";

export { buildRenderContext } from "./resolvers/build-context";
export { resolveProposalView } from "./resolve";
export { resolveProposalStructure } from "./resolvers/resolve-structure";
export {
  resolvePhaseNarrative,
  resolveAllPhaseNarratives,
} from "./resolvers/resolve-phase-narrative";
export {
  resolvePhaseLabel,
  contextualAliasSet,
} from "./resolvers/resolve-phase-label";
export { resolveClauses } from "./resolvers/resolve-clauses";
export { resolveCoverPage, resolveCoverLetter } from "./resolvers/resolve-cover";
export { resolveCommercialNotes } from "./resolvers/resolve-commercial";

export { SECTION_REGISTRY } from "./registry/sections";
export { CLAUSE_REGISTRY } from "./registry/clauses";
export { PHASE_NARRATIVES, PHASE_VARIANTS } from "./registry/phase-narratives";

export { applyTokens, applyTokensAll } from "./utils/tokens";
export { matches as matchesApplicability } from "./utils/applicability";
export type {
  Applicability,
  SectionRegistryEntry,
  ClauseRegistryEntry,
} from "./utils/applicability";

export { useResolvedProposal } from "./hooks/use-resolved-proposal";
export type { UseResolvedProposalArgs } from "./hooks/use-resolved-proposal";

// Staffing resolvers (proposal role abstraction — unwired infrastructure).
export {
  resolvePhaseDuration,
  resolvePhaseEstimatedHours,
  resolvePhaseStaffingMix,
} from "./resolvers/staffing";
export type {
  PhaseDuration,
  StaffingResolverContext,
} from "./resolvers/staffing";
