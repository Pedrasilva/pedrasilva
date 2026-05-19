import type { Database } from "@/integrations/supabase/types";

// ============================================================
// PSA Proposal Ontology — Milestone 1
// Canonical registry row types (read-only consumers).
// These tables sit BESIDE the existing PSA Hub proposal engine.
// They do not replace fee_proposals, quote_stages, or any existing
// PSA Hub structure.
// ============================================================

export type ProposalFamily =
  Database["public"]["Tables"]["proposal_families"]["Row"];

export type ProposalPhase =
  Database["public"]["Tables"]["proposal_phases"]["Row"];

export type ProposalPhaseAlias =
  Database["public"]["Tables"]["proposal_phase_aliases"]["Row"];

export type ProposalAddonModule =
  Database["public"]["Tables"]["proposal_addon_modules"]["Row"];

export type ProposalDeliveryMode =
  Database["public"]["Tables"]["proposal_delivery_modes"]["Row"];

export type ProposalCommercialComponent =
  Database["public"]["Tables"]["proposal_commercial_components"]["Row"];

export type ProposalFlag =
  Database["public"]["Tables"]["proposal_flags"]["Row"];

export type ProposalPreset =
  Database["public"]["Tables"]["proposal_presets"]["Row"];

// ------------------------------------------------------------
// Canonical enum literals (mirror seeded codes; not enforced at DB).
// ------------------------------------------------------------

export type PhaseCode =
  | "P0" | "P1" | "P2" | "P3" | "P4" | "P5"
  | "P6" | "P7" | "P8" | "P8_5" | "P9";

export type PhaseClass =
  | "finite_milestone"
  | "operational_recurring"
  | "parallel_addon";

export type AliasSet = "psa_internal" | "riba" | "portaria_255" | "ccp";

export type DeliveryModeCode =
  | "psa_led" | "psa_assist_local" | "local_led_psa_oversight";

export type FamilyCode =
  | "architecture" | "workplace" | "hospitality" | "healthcare"
  | "interior_design" | "strategy" | "retainer" | "competition"
  | "due_diligence";
