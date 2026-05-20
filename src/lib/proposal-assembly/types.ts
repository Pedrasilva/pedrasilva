/**
 * Proposal Container & Assembly Layer — Milestone 1.
 *
 * Pure / deterministic types. No React, no Supabase.
 * Produces a structured editable proposal container tree from:
 *   - proposal family, preset, delivery mode
 *   - ontology phases, flags, add-ons
 *   - quote data (stages, fees, payment schedule, gantt-ready data)
 *
 * Output is consumed by `useAssembleProposal` which translates containers
 * into `quote_proposal_document_blocks` rows (existing schema, unchanged).
 * Every emitted block remains fully editable / deletable / reorderable.
 */
import type { Locale } from "@/lib/proposal-rendering";

export type ProposalFamily = "workplace" | "residential" | "retail" | "hospitality" | "civic";
export type ProposalPreset =
  | "large_corporate_fitout"
  | "small_fitout"
  | "headquarters"
  | "flagship_retail"
  | "single_home"
  | "multi_residential";
export type ProposalDeliveryMode = "psa_led" | "consultant_led" | "design_build";

export type AssemblyAppendixId =
  | "I"   // General Conditions
  | "II"  // Scope & Deliverables Matrix
  | "III" // Programme / Gantt
  | "IV"  // Fee & Payment Schedule
  | "V"   // Optional Services
  | "VI"; // Consultant Interfaces

export type AssemblyMainSectionId =
  | "cover_page"
  | "cover_letter"
  | "executive_summary"
  | "project_understanding"
  | "design_approach"
  | "scope_overview"
  | "phase_narratives"
  | "fee_summary"
  | "signature";

export type AssemblySectionId =
  | AssemblyMainSectionId
  | "attachment_i"
  | "attachment_ii"
  | "attachment_iii"
  | "attachment_iv"
  | "attachment_v"
  | "attachment_vi";

export type AssemblyProvenanceSource =
  | "ontology"
  | "fee_engine"
  | "planning_engine"
  | "crm"
  | "clause_template"
  | "manual";

export interface AssemblyProvenance {
  source: AssemblyProvenanceSource;
  templateKey?: string;
  seededAt: string;
  placeholdersResolved: string[];
  assemblyKey: string;
}

export type AssemblyLockLevel = "none" | "semi" | "full";

export interface ProposalBlockSeed {
  /** Stable id within the container so reassembly can diff. */
  localId: string;
  title: string;
  /** Plain text or lightweight markdown — same shape as existing editable_text blocks. */
  content: string;
  /** Optional structured payload (gantt settings, fee table data, etc.). */
  payload?: Record<string, unknown>;
}

export interface ProposalContainer {
  id: string; // `${assemblyKey}:${sectionId}`
  kind: "main" | "attachment";
  sectionId: AssemblySectionId;
  title: { en: string; pt: string };
  order: number;
  enabled: boolean;
  locked: AssemblyLockLevel;
  blocks: ProposalBlockSeed[];
  provenance: AssemblyProvenance;
}

export interface AssemblyFlags {
  showHours: boolean;
  showDurations: boolean;
  showConsultantTrack: boolean;
}

export interface AssemblyAppendixToggles {
  I: boolean;
  II: boolean;
  III: boolean;
  IV: boolean;
  V: boolean;
  VI: boolean;
}

/** Minimal CRM/quote inputs the engine needs. Kept loose to avoid coupling. */
export interface AssemblyData {
  quote: {
    id: string;
    code?: string | null;
    title?: string | null;
    project_name?: string | null;
    client_name?: string | null;
    currency?: string | null;
    proposal_date?: string | null;
    proposal_version?: string | null;
  };
  stages: Array<{
    code: string;            // e.g. "P1"..."P6", "CA"
    name: string;
    start_date?: string | null;
    end_date?: string | null;
    duration_days?: number | null;
    estimated_hours?: number | null;
    fee?: number | null;
  }>;
  paymentSchedule: Array<{
    label: string;
    trigger: string;
    amount: number;
  }>;
  feeBreakdown?: {
    total: number;
    constructionMonthlyFee?: number | null;
    constructionMonthlyHours?: number | null;
    constructionDurationMonths?: number | null;
  } | null;
  exclusions?: string[];
}

export interface AssemblyInput {
  family: ProposalFamily;
  preset: ProposalPreset;
  deliveryMode: ProposalDeliveryMode;
  language: Locale;
  flags: AssemblyFlags;
  addOns: string[];
  appendices: AssemblyAppendixToggles;
  data: AssemblyData;
  /** Used as the stable container-id prefix. Typically `${quoteId}:${version}`. */
  assemblyKey: string;
}

export interface AssembledProposal {
  input: AssemblyInput;
  containers: ProposalContainer[];
  unresolvedPlaceholders: string[];
  warnings: string[];
}
