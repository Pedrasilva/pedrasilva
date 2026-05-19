/**
 * Stage 6A — Build a sealed Project Bootstrap snapshot from a signed contract.
 *
 * This consumes ONLY the sealed contract snapshot — never the live quote —
 * so upstream proposal drift cannot affect the project that is created.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ContractSnapshotBundle } from "@/lib/contracts";
import {
  PROJECT_BOOTSTRAP_RESOLVER_VERSION,
  type ProjectBootstrapSnapshot,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function buildProjectBootstrapSnapshot(
  contractId: string,
): Promise<ProjectBootstrapSnapshot> {
  const { data, error } = await db
    .from("contracts")
    .select(
      "id, title, status, signed_at, revision_number, root_contract_id, contract_number, currency, source_quote_id, source_opportunity_id, source_company_id, snapshot_json",
    )
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Contract ${contractId} not found`);
  if (data.status !== "signed") {
    throw new Error(
      `Project bootstrap requires a signed contract (status="${data.status}")`,
    );
  }

  const snap = data.snapshot_json as ContractSnapshotBundle;

  return {
    resolver_version: PROJECT_BOOTSTRAP_RESOLVER_VERSION,
    generated_at: new Date().toISOString(),
    contract: {
      id: data.id,
      title: data.title,
      status: data.status,
      signed_at: data.signed_at,
      revision_number: data.revision_number ?? 1,
      root_contract_id: data.root_contract_id ?? null,
      contract_number: data.contract_number ?? null,
      currency: data.currency,
    },
    source_quote_id: data.source_quote_id ?? null,
    source_opportunity_id: data.source_opportunity_id ?? null,
    source_company_id: data.source_company_id ?? null,
    contract_snapshot: snap,
  };
}
