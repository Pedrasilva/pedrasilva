/**
 * Phase label / alias resolution.
 *
 * The canonical phase label is rendered by default. When `publicTenderMode`
 * is on (Portaria 255 / CCP), or when the caller explicitly requests an
 * alias set, the alias label is returned instead — with a graceful fallback
 * to the canonical label if no alias is seeded for the requested combo.
 */
import type {
  ProposalPhase,
  ProposalPhaseAlias,
  AliasSet,
} from "@/lib/proposal-ontology/types";
import type { Locale, RenderContext } from "../types";

export interface ResolvePhaseLabelArgs {
  phase: ProposalPhase;
  aliases?: ProposalPhaseAlias[];
  aliasSet?: AliasSet;
  locale: Locale;
}

export function resolvePhaseLabel(args: ResolvePhaseLabelArgs): string {
  const { phase, aliases = [], aliasSet, locale } = args;
  const canonical = locale === "pt-PT" ? phase.label_pt : phase.label_en;
  if (!aliasSet) return canonical;

  const exact = aliases.find(
    (a) => a.phase_code === phase.code && a.alias_set === aliasSet && a.locale === locale,
  );
  if (exact) return exact.label;
  const anyLocale = aliases.find(
    (a) => a.phase_code === phase.code && a.alias_set === aliasSet,
  );
  return anyLocale?.label ?? canonical;
}

/**
 * Picks an alias set from the RenderContext: public-tender mode → portaria_255,
 * otherwise PSA-internal nomenclature.
 */
export function contextualAliasSet(ctx: RenderContext): AliasSet {
  if (ctx.publicTenderMode) return "portaria_255";
  return "psa_internal";
}
