/**
 * Stage 6A — Project Bootstrap Foundation
 */
import type { Database } from "@/integrations/supabase/types";
import type { ContractSnapshotBundle } from "@/lib/contracts";

export type ProjectBootstrapRunRow =
  Database["public"]["Tables"]["project_bootstrap_runs"]["Row"];
export type ProjectBootstrapStatus =
  Database["public"]["Enums"]["project_bootstrap_status"];

export const PROJECT_BOOTSTRAP_RESOLVER_VERSION = "project-bootstrap.v1" as const;

/** Sealed snapshot consumed by the bootstrap resolver. */
export interface ProjectBootstrapSnapshot {
  resolver_version: string;
  generated_at: string;
  contract: {
    id: string;
    title: string;
    status: string;
    signed_at: string | null;
    revision_number: number;
    root_contract_id: string | null;
    contract_number: string | null;
    currency: string;
  };
  source_quote_id: string | null;
  source_opportunity_id: string | null;
  source_company_id: string | null;
  /** Verbatim copies of the sealed contract snapshots. */
  contract_snapshot: ContractSnapshotBundle;
}

export interface PreviewStage {
  key: string;          // source_contract_phase_key
  name: string;
  start_date: string | null;
  end_date: string | null;
  budget: number;
  sort_order: number;
}

export interface PreviewDependency {
  predecessor_key: string;
  successor_key: string;
  type: "FS" | "SS" | "FF" | "SF";
  lag_days: number;
}

export interface ProjectBootstrapPreview {
  project: {
    name: string;
    company_id: string | null;
    opportunity_id: string | null;
    quote_id: string | null;
    sold_fee: number;
    sold_internal_fee: number | null;
    sold_external_fee: number | null;
    sold_pricing_multiplier: number | null;
    sold_at: string | null;
    currency: string;
  };
  stages: PreviewStage[];
  dependencies: PreviewDependency[];
  warnings: string[];
  skipped: string[];
  unsupported: string[];
}
