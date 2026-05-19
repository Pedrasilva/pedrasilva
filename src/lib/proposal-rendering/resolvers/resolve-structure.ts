/**
 * Resolves the ordered section structure for a proposal from the section
 * registry plus the RenderContext. Pure / deterministic / stateless.
 */
import type { RenderContext, ResolvedSection } from "../types";
import { SECTION_REGISTRY } from "../registry/sections";
import { matches } from "../utils/applicability";

export function resolveProposalStructure(ctx: RenderContext): ResolvedSection[] {
  if (!ctx.ontologyAvailable) return [];

  const matched = SECTION_REGISTRY.filter((s) => matches(ctx, s.applicability));

  // For the same `id` we may have multiple variants (e.g. methodology). All
  // matching variants are kept — the renderer can choose to dedupe by id or
  // present them as nested subsections.
  const resolved: ResolvedSection[] = matched.map((s, i) => ({
    id: s.id,
    order: s.baseOrder + i * 1e-6, // stable tiebreaker
    title: ctx.locale === "pt-PT" ? s.titlePt : s.titleEn,
    subtitle:
      ctx.locale === "pt-PT" ? s.subtitlePt : s.subtitleEn,
    includedByDefault: s.includedByDefault,
    tags: s.tags,
    reason: s.reason,
  }));

  resolved.sort((a, b) => a.order - b.order);
  return resolved;
}
