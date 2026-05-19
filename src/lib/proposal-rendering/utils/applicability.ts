/**
 * Tiny applicability evaluator shared by section + clause registries.
 *
 * A condition is a plain object describing intersections that must hold for
 * a registry entry to fire. Keeping this as pure data (not callbacks) makes
 * the registries serialisable, inspectable in the UI, and trivial to test.
 */
import type {
  ClauseCode,
  RenderContext,
  ResolvedClause,
  ResolvedSection,
  SectionId,
} from "../types";
import type {
  DeliveryModeCode,
  FamilyCode,
  PhaseCode,
} from "@/lib/proposal-ontology/types";

export interface Applicability {
  families?: FamilyCode[];
  presets?: string[];
  /** ALL listed phases must be enabled. */
  requiresPhases?: PhaseCode[];
  /** ANY of the listed phases must be enabled. */
  anyPhases?: PhaseCode[];
  deliveryModes?: DeliveryModeCode[];
  addons?: string[];
  /** Required flag equality (`flagCode === value`). */
  flagsEq?: Record<string, unknown>;
  /** Flags that must be truthy. */
  flagsTrue?: string[];
  publicTenderMode?: boolean;
  bimEnabled?: boolean;
  /** Custom predicate — last resort. */
  predicate?: (ctx: RenderContext) => boolean;
}

export function matches(ctx: RenderContext, a: Applicability | undefined): boolean {
  if (!a) return true;
  if (a.families && (!ctx.family || !a.families.includes(ctx.family))) return false;
  if (a.presets && (!ctx.presetCode || !a.presets.includes(ctx.presetCode))) {
    return false;
  }
  if (a.requiresPhases && !a.requiresPhases.every((p) => ctx.enabledPhases.includes(p))) {
    return false;
  }
  if (a.anyPhases && !a.anyPhases.some((p) => ctx.enabledPhases.includes(p))) {
    return false;
  }
  if (a.deliveryModes && (!ctx.deliveryMode || !a.deliveryModes.includes(ctx.deliveryMode))) {
    return false;
  }
  if (a.addons && !a.addons.some((c) => ctx.addonCodes.includes(c))) return false;
  if (a.flagsEq) {
    for (const [k, v] of Object.entries(a.flagsEq)) {
      if (ctx.flags[k] !== v) return false;
    }
  }
  if (a.flagsTrue && !a.flagsTrue.every((k) => Boolean(ctx.flags[k]))) return false;
  if (a.publicTenderMode != null && a.publicTenderMode !== ctx.publicTenderMode) {
    return false;
  }
  if (a.bimEnabled != null && a.bimEnabled !== ctx.bimEnabled) return false;
  if (a.predicate && !a.predicate(ctx)) return false;
  return true;
}

// ---------- types re-export helpers (avoid circular imports elsewhere) ----------

export type SectionRegistryEntry = {
  id: SectionId;
  baseOrder: number;
  titleEn: string;
  titlePt: string;
  subtitleEn?: string;
  subtitlePt?: string;
  includedByDefault: boolean;
  tags: string[];
  applicability?: Applicability;
  /** Reason string surfaced in the resolved section (audit trail). */
  reason: string;
};

export type ClauseRegistryEntry = {
  code: ClauseCode;
  titleEn: string;
  titlePt: string;
  bodyEn: string;
  bodyPt: string;
  preferredSection: SectionId;
  tone: ResolvedClause["tone"];
  applicability?: Applicability;
  reason: string;
};

export type ResolvedSectionFactory = (entry: SectionRegistryEntry, ctx: RenderContext) => ResolvedSection;
