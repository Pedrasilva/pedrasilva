/**
 * Stage 5A — Contract Generator Foundation
 *
 * Local types for the contract layer. The DB row types come from
 * Supabase (`Database["public"]["Tables"]["contracts"]["Row"]` etc.),
 * but most app code talks to these enriched shapes.
 */
import type { Database } from "@/integrations/supabase/types";

export type ContractRow         = Database["public"]["Tables"]["contracts"]["Row"];
export type ContractClauseRow   = Database["public"]["Tables"]["contract_clauses"]["Row"];
export type ContractExhibitRow  = Database["public"]["Tables"]["contract_exhibits"]["Row"];
export type ContractEventRow    = Database["public"]["Tables"]["contract_events"]["Row"];

export type ContractStatus = ContractRow["status"];
export type ContractKind   = ContractRow["contract_kind"];

/** Sealed proposal snapshot — copied verbatim into the contract at draft creation. */
export interface ContractProposalSnapshot {
  quote_id: string;
  title: string;
  quote_status: string;
  quote_type: string | null;
  quote_category: string | null;
  currency: string;
  company: { id: string | null; name: string | null };
  opportunity: { id: string | null; name: string | null };
  pm_project_id: string | null;
  proposal_kind: string | null;
  is_public_tender: boolean;
}

export interface ContractOntologySnapshot {
  family_code: string | null;
  preset_code: string | null;
  delivery_mode: string | null;
  flags: Record<string, unknown>;
  metadata: Record<string, unknown>;
  enabled_phases: Array<{
    code: string | null;
    name: string;
    order: number;
    duration_days: number | null;
    fee_amount: number | null;
  }>;
  bootstrapped_at: string | null;
}

export interface ContractCommercialSnapshot {
  total_fee: number;
  pricing_multiplier: number | null;
  payment_schedule: Array<{
    label: string | null;
    sequence: number;
    amount: number;
    due_date: string | null;
    notes: string | null;
  }>;
  external_services: Array<{
    name: string;
    purchase_price: number | null;
    sale_price: number | null;
    quantity: number | null;
  }>;
  has_at_retainer: boolean;
  recurring: boolean;
}

/** Full sealed snapshot bundle written into the contract row. */
export interface ContractSnapshotBundle {
  resolver_version: string;
  generated_at: string;
  proposal: ContractProposalSnapshot;
  ontology: ContractOntologySnapshot;
  commercial: ContractCommercialSnapshot;
}

export interface ResolvedClause {
  clause_key: string;
  title: string;
  content: string;
  sort_order: number;
  source_resolver: string;
  source_ontology_component: string | null;
}

export interface ResolvedExhibit {
  exhibit_key: string;
  title: string;
  content_json: Record<string, unknown>;
  sort_order: number;
  source_type: string | null;
  source_id: string | null;
}

export const CONTRACT_RESOLVER_VERSION = "contracts.v1" as const;
