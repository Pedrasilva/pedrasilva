/**
 * Proposal Rendering Layer — Milestone 4
 *
 * Deterministic, ontology-aware structures used by the resolver pipeline.
 * This module is ADDITIVE: it does not replace `proposal_blocks`,
 * `quote_proposal_document_blocks`, the proposal builder, or the legacy
 * proposal renderer. It produces *resolved views* that the UI may opt into.
 *
 * Legacy proposals that lack ontology metadata skip this entire pipeline.
 */

import type {
  FamilyCode,
  PhaseCode,
  DeliveryModeCode,
} from "@/lib/proposal-ontology/types";

// ---------------------------------------------------------------
// Render context — the single input to every resolver
// ---------------------------------------------------------------

export type Locale = "en" | "pt-PT";

export type ProposalRenderKind =
  | "fee_proposal"
  | "phased_consultancy"
  | "consultancy_hours_package"
  | "construction_retainer"
  | "umbrella";

export interface RenderTokens {
  proposalTitle?: string | null;
  proposalCode?: string | null;
  clientName?: string | null;
  accountName?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  contactName?: string | null;
  firmName?: string | null;
  firmAddress?: string | null;
  firmEmail?: string | null;
  firmPhone?: string | null;
  isoDate?: string | null;
}

export interface RenderContext {
  locale: Locale;
  /** When false, all resolvers must short-circuit; legacy doc path is used. */
  ontologyAvailable: boolean;
  family: FamilyCode | null;
  presetCode: string | null;
  enabledPhases: PhaseCode[];
  deliveryMode: DeliveryModeCode | null;
  flags: Record<string, unknown>;
  addonCodes: string[];
  proposalKind: ProposalRenderKind;
  /** Convenience derived flags — populated by `buildRenderContext`. */
  publicTenderMode: boolean;
  bimEnabled: boolean;
  jurisdiction: string;
  atRetainerMode: string | null;
  scopeOfArchitecture: string | null;
  tokens: RenderTokens;
}

// ---------------------------------------------------------------
// Structure resolver output
// ---------------------------------------------------------------

export type SectionId =
  | "cover_page"
  | "cover_letter"
  | "executive_summary"
  | "scope_overview"
  | "phase_breakdown"
  | "methodology"
  | "deliverables"
  | "commercial_terms"
  | "exclusions"
  | "payment_terms"
  | "assumptions"
  | "team"
  | "schedule"
  | "signature";

export interface ResolvedSection {
  id: SectionId;
  /** Sort order in the resolved document. */
  order: number;
  /** Localized title for the rendered section. */
  title: string;
  /** Optional short subtitle / lead-in. */
  subtitle?: string;
  /** Whether the section appears by default; users may still hide it. */
  includedByDefault: boolean;
  /** Sticky tags useful for the builder UI ("Workplace", "BIM", "AT"). */
  tags: string[];
  /** Why this section was emitted — debugging / auditability. */
  reason: string;
}

// ---------------------------------------------------------------
// Phase narrative resolver output
// ---------------------------------------------------------------

export interface ResolvedPhaseNarrative {
  phaseCode: PhaseCode;
  label: string;
  aliasLabel?: string;
  purpose: string;
  outputs: string[];
  coordinationScope: string;
  deliverables: string[];
  exclusions: string[];
  notes: string[];
  billingWording: string;
  /** Render hints — never enforce hiding in UI. */
  isOptional: boolean;
  isRecurring: boolean;
  isParallelAddon: boolean;
}

// ---------------------------------------------------------------
// Clause engine
// ---------------------------------------------------------------

export type ClauseCode =
  | "bim_methodology"
  | "at_retainer"
  | "at_standby"
  | "at_demolition_exclusion"
  | "licensing_disclaimer"
  | "local_consultant_disclaimer"
  | "ffe_exclusion"
  | "ffe_inclusion"
  | "procurement_support"
  | "procurement_led"
  | "travel_reimbursement"
  | "shell_core_limitation"
  | "public_tender_compliance"
  | "close_out_responsibilities"
  | "telas_finais_responsibility"
  | "consultant_coordination_psa_led"
  | "consultant_coordination_client_led"
  | "specialist_exclusions"
  | "workplace_test_fit_methodology"
  | "workplace_stakeholder_workshops"
  | "hospitality_specialist_coordination"
  | "healthcare_signage_wayfinding";

export interface ResolvedClause {
  code: ClauseCode;
  title: string;
  /** Rendered prose with tokens already substituted. */
  body: string;
  /** Where in the document this clause naturally lives. */
  preferredSection: SectionId;
  /** Why the clause fired — for debugging / audit trail. */
  reason: string;
  /** Optional severity tag for UI presentation. */
  tone: "default" | "limitation" | "exclusion" | "obligation";
}

// ---------------------------------------------------------------
// Cover page + letter
// ---------------------------------------------------------------

export interface ResolvedCoverPage {
  title: string;
  subtitle: string;
  client: string;
  project: string;
  isoDate: string;
  proposalCode: string;
  familyLabel: string;
  firmName: string;
}

export interface ResolvedCoverLetter {
  greeting: string;
  paragraphs: string[];
  closing: string;
  signatory: string;
}

// ---------------------------------------------------------------
// Commercial rendering
// ---------------------------------------------------------------

export interface ResolvedCommercialNote {
  code: string;
  title: string;
  body: string;
  /** Group: how the wording should be presented in the commercial section. */
  group: "milestone" | "recurring" | "procurement" | "subcontracting" | "general";
}

// ---------------------------------------------------------------
// Aggregate "resolved proposal view"
// ---------------------------------------------------------------

export interface ResolvedProposalView {
  context: RenderContext;
  /** When false, callers MUST fall back to legacy rendering. */
  applied: boolean;
  structure: ResolvedSection[];
  phaseNarratives: ResolvedPhaseNarrative[];
  clauses: ResolvedClause[];
  cover?: ResolvedCoverPage;
  coverLetter?: ResolvedCoverLetter;
  commercialNotes: ResolvedCommercialNote[];
}
