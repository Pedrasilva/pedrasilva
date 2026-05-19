/**
 * Top-level aggregator: a single call that returns the full
 * `ResolvedProposalView` for the given context. Pure / deterministic.
 *
 * When `ctx.ontologyAvailable === false` the view is returned with
 * `applied: false` and empty arrays — the caller MUST then fall back to
 * the legacy renderer (existing proposal blocks).
 */
import type { RenderContext, ResolvedProposalView } from "./types";
import { resolveProposalStructure } from "./resolvers/resolve-structure";
import { resolveAllPhaseNarratives } from "./resolvers/resolve-phase-narrative";
import { resolveClauses } from "./resolvers/resolve-clauses";
import { resolveCoverLetter, resolveCoverPage } from "./resolvers/resolve-cover";
import { resolveCommercialNotes } from "./resolvers/resolve-commercial";

export function resolveProposalView(ctx: RenderContext): ResolvedProposalView {
  if (!ctx.ontologyAvailable) {
    return {
      context: ctx,
      applied: false,
      structure: [],
      phaseNarratives: [],
      clauses: [],
      commercialNotes: [],
    };
  }
  return {
    context: ctx,
    applied: true,
    structure: resolveProposalStructure(ctx),
    phaseNarratives: resolveAllPhaseNarratives(ctx),
    clauses: resolveClauses(ctx),
    cover: resolveCoverPage(ctx),
    coverLetter: resolveCoverLetter(ctx),
    commercialNotes: resolveCommercialNotes(ctx),
  };
}
