/**
 * Build a RenderContext from a fee_proposals row + a few side inputs.
 * Centralises the read of ontology metadata so resolvers stay pure.
 */
import type {
  Locale,
  ProposalRenderKind,
  RenderContext,
  RenderTokens,
} from "../types";
import type {
  DeliveryModeCode,
  FamilyCode,
  PhaseCode,
} from "@/lib/proposal-ontology/types";

export interface FeeProposalOntologySlice {
  ontology_family_code: string | null;
  ontology_preset_code: string | null;
  ontology_flags: Record<string, unknown> | null;
  ontology_metadata: Record<string, unknown> | null;
}

export interface BuildContextArgs {
  locale: Locale;
  proposalKind: ProposalRenderKind;
  proposal?: FeeProposalOntologySlice | null;
  /** Phase codes derived from quote_stages.phase_code (deduped, ordered). */
  enabledPhases: PhaseCode[];
  /** Add-on module codes derived from quote_stages.addon_module_code. */
  addonCodes?: string[];
  tokens?: RenderTokens;
}

const ALLOWED_FAMILIES = new Set<FamilyCode>([
  "architecture", "workplace", "hospitality", "healthcare",
  "interior_design", "strategy", "retainer", "competition", "due_diligence",
]);

const ALLOWED_DELIVERY = new Set<DeliveryModeCode>([
  "psa_led", "psa_assist_local", "local_led_psa_oversight",
]);

function asFamily(v: string | null | undefined): FamilyCode | null {
  return v && ALLOWED_FAMILIES.has(v as FamilyCode) ? (v as FamilyCode) : null;
}

function asDelivery(v: unknown): DeliveryModeCode | null {
  return typeof v === "string" && ALLOWED_DELIVERY.has(v as DeliveryModeCode)
    ? (v as DeliveryModeCode)
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function buildRenderContext(args: BuildContextArgs): RenderContext {
  const {
    locale,
    proposalKind,
    proposal,
    enabledPhases,
    addonCodes = [],
    tokens = {},
  } = args;

  // Legacy proposals (pre-ontology): no family/preset → resolvers short-circuit.
  const ontologyAvailable = Boolean(
    proposal?.ontology_family_code || proposal?.ontology_preset_code,
  );

  const flags = (proposal?.ontology_flags ?? {}) as Record<string, unknown>;
  const meta = (proposal?.ontology_metadata ?? {}) as Record<string, unknown>;

  return {
    locale,
    ontologyAvailable,
    family: asFamily(proposal?.ontology_family_code ?? null),
    presetCode: proposal?.ontology_preset_code ?? null,
    enabledPhases: Array.from(new Set(enabledPhases)) as PhaseCode[],
    deliveryMode: asDelivery(meta["delivery_mode"]),
    flags,
    addonCodes: Array.from(new Set(addonCodes)),
    proposalKind,
    publicTenderMode: Boolean(flags["public_tender_mode"]),
    bimEnabled: Boolean(flags["bim_enabled"]),
    jurisdiction: asString(flags["jurisdiction"]) ?? "PT",
    atRetainerMode: asString(flags["at_retainer_mode"]),
    scopeOfArchitecture: asString(flags["scope_of_architecture"]),
    tokens: {
      isoDate: new Date().toISOString().slice(0, 10),
      ...tokens,
    },
  };
}
