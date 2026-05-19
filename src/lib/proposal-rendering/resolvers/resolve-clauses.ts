/**
 * Resolves the set of clauses that should be injected into the document.
 * Pure / deterministic; the user remains free to delete or edit any clause
 * after it lands in the proposal builder.
 */
import type { RenderContext, ResolvedClause } from "../types";
import { CLAUSE_REGISTRY } from "../registry/clauses";
import { matches } from "../utils/applicability";

export function resolveClauses(ctx: RenderContext): ResolvedClause[] {
  if (!ctx.ontologyAvailable) return [];
  const matched = CLAUSE_REGISTRY.filter((c) => matches(ctx, c.applicability));

  return matched.map<ResolvedClause>((c) => ({
    code: c.code,
    title: ctx.locale === "pt-PT" ? c.titlePt : c.titleEn,
    body: ctx.locale === "pt-PT" ? c.bodyPt : c.bodyEn,
    preferredSection: c.preferredSection,
    reason: c.reason,
    tone: c.tone,
  }));
}
