/**
 * PSA Proposal Composer — public types.
 *
 * Mirrors the psa_* tables introduced in the Phase 1 migration.
 * Kept hand-written (rather than relying on generated Database types) so
 * the composer can ship before the next Supabase types regeneration.
 */

export type PsaProposalStatus =
  | "draft"
  | "review"
  | "sent"
  | "accepted"
  | "declined"
  | "archived";

export type PsaBlockType =
  | "cover"
  | "index"
  | "about"
  | "scope"
  | "stage_list"
  | "stage_item"
  | "timeline"
  | "consultants"
  | "fee_table"
  | "construction_fee"
  | "payment_terms"
  | "payment_schedule"
  | "additional_services"
  | "general"
  | "suspension"
  | "exclusions"
  | "acceptance"
  | "custom_text"
  | "page_break";

export type PsaSourceType =
  | "manual"
  | "library"
  | "live_quote"
  | "mixed"
  | "contract_clause";

export type PsaContractRelevance =
  | "proposal_only"
  | "contract_relevant"
  | "both"
  | "internal_only";

export interface PsaProposal {
  id: string;
  quote_id: string | null;
  title: string;
  status: PsaProposalStatus;
  client_snapshot: Record<string, unknown>;
  project_snapshot: Record<string, unknown>;
  vat_mode: string | null;
  language: string;
  created_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PsaProposalBlock {
  id: string;
  proposal_id: string;
  sort_order: number;
  block_type: PsaBlockType;
  title: string;
  source_type: PsaSourceType;
  source_ref: Record<string, unknown>;
  content_rich: Record<string, unknown> & { text?: string };
  contract_relevance: PsaContractRelevance;
  is_visible: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface PsaLibraryEntry {
  id: string;
  kind: PsaBlockType;
  label: string;
  default_title: string;
  default_content_rich: Record<string, unknown> & { text?: string };
  default_source_type: PsaSourceType;
  default_source_ref: Record<string, unknown>;
  default_contract_relevance: PsaContractRelevance;
  sort_hint: number;
  is_system: boolean;
}

export const RELEVANCE_LABEL: Record<PsaContractRelevance, string> = {
  proposal_only: "Proposta",
  contract_relevant: "Contrato",
  both: "Ambos",
  internal_only: "Interno",
};

export const RELEVANCE_TONE: Record<PsaContractRelevance, string> = {
  proposal_only: "bg-blue-100 text-blue-800",
  contract_relevant: "bg-amber-100 text-amber-800",
  both: "bg-emerald-100 text-emerald-800",
  internal_only: "bg-zinc-200 text-zinc-700",
};

export const SOURCE_LABEL: Record<PsaSourceType, string> = {
  manual: "Manual",
  library: "Biblioteca",
  live_quote: "Dados do Orçamento (live)",
  mixed: "Misto",
  contract_clause: "Cláusula contratual",
};
