/**
 * Builds the resolved narrative for the enabled phases of a proposal.
 * Variants (family / delivery mode) are merged onto the base template.
 */
import type {
  RenderContext,
  ResolvedPhaseNarrative,
  Locale,
} from "../types";
import type { PhaseCode } from "@/lib/proposal-ontology/types";
import {
  PHASE_NARRATIVES,
  PHASE_VARIANTS,
  type PhaseNarrativeTemplate,
} from "../registry/phase-narratives";

function mergeVariant(
  base: PhaseNarrativeTemplate,
  ctx: RenderContext,
): PhaseNarrativeTemplate {
  return PHASE_VARIANTS.filter((v) => {
    if (v.family && v.family !== ctx.family) return false;
    if (v.deliveryMode && v.deliveryMode !== ctx.deliveryMode) return false;
    return true;
  }).reduce<PhaseNarrativeTemplate>((acc, v) => ({ ...acc, ...v.patch }), base);
}

function localize<T>(en: T, pt: T, locale: Locale): T {
  return locale === "pt-PT" ? pt : en;
}

const PHASE_LABEL: Record<PhaseCode, { en: string; pt: string }> = {
  P0: { en: "Strategic Framing", pt: "Enquadramento Estratégico" },
  P1: { en: "Pre-design", pt: "Análise Prévia" },
  P2: { en: "Concept Design", pt: "Estudo Prévio" },
  P3: { en: "Developed Design", pt: "Anteprojeto" },
  P4: { en: "Licensing", pt: "Licenciamento" },
  P5: { en: "Technical Design", pt: "Projeto de Execução" },
  P6: { en: "Tender Support", pt: "Apoio ao Concurso" },
  P7: { en: "Construction Assistance", pt: "Assistência Técnica" },
  P8: { en: "Close-out", pt: "Encerramento" },
  P8_5: { en: "Post-occupancy", pt: "Pós-ocupação" },
  P9: { en: "FF&E", pt: "FF&E" },
};

export function resolvePhaseNarrative(
  phase: PhaseCode,
  ctx: RenderContext,
): ResolvedPhaseNarrative | null {
  const base = PHASE_NARRATIVES[phase];
  if (!base) return null;
  const merged = mergeVariant(base, ctx);

  return {
    phaseCode: phase,
    label: localize(PHASE_LABEL[phase].en, PHASE_LABEL[phase].pt, ctx.locale),
    purpose: localize(merged.purposeEn, merged.purposePt, ctx.locale),
    outputs: localize(merged.outputsEn, merged.outputsPt, ctx.locale),
    coordinationScope: localize(merged.coordinationEn, merged.coordinationPt, ctx.locale),
    deliverables: localize(merged.deliverablesEn, merged.deliverablesPt, ctx.locale),
    exclusions: localize(merged.exclusionsEn, merged.exclusionsPt, ctx.locale),
    notes: localize(merged.notesEn ?? [], merged.notesPt ?? [], ctx.locale),
    billingWording: localize(merged.billingEn, merged.billingPt, ctx.locale),
    isOptional: phase === "P0" || phase === "P8_5" || phase === "P9",
    isRecurring: phase === "P7",
    isParallelAddon: phase === "P9",
  };
}

export function resolveAllPhaseNarratives(ctx: RenderContext): ResolvedPhaseNarrative[] {
  if (!ctx.ontologyAvailable) return [];
  return ctx.enabledPhases
    .map((p) => resolvePhaseNarrative(p, ctx))
    .filter((x): x is ResolvedPhaseNarrative => x != null);
}
