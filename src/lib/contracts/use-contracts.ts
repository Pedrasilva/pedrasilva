/**
 * Stage 5A — Contract Generator Foundation
 *
 * React-Query hooks:
 *  - useContract(id)            — read a single contract + children
 *  - useContractsByQuote(qId)   — list contracts for a quote (draft routing)
 *  - useCreateDraftContractFromQuote() — sealed-snapshot draft creation
 *
 * Sealed-snapshot rule: a contract's snapshot fields are written once at
 * draft creation. Later proposal edits NEVER mutate them. Re-rendering
 * is allowed via an explicit user action only while status='draft'.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildContractSnapshot } from "./contract-snapshots";
import {
  resolveContractClauses,
  resolveContractExhibits,
} from "./contract-resolver";
import {
  CONTRACT_RESOLVER_VERSION,
  type ContractClauseRow,
  type ContractEventRow,
  type ContractExhibitRow,
  type ContractRow,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export function useContract(contractId: string | null | undefined) {
  return useQuery({
    enabled: !!contractId,
    queryKey: ["contract", contractId],
    queryFn: async () => {
      const [c, clauses, exhibits, events] = await Promise.all([
        db.from("contracts").select("*").eq("id", contractId).maybeSingle(),
        db
          .from("contract_clauses")
          .select("*")
          .eq("contract_id", contractId)
          .order("sort_order", { ascending: true }),
        db
          .from("contract_exhibits")
          .select("*")
          .eq("contract_id", contractId)
          .order("sort_order", { ascending: true }),
        db
          .from("contract_events")
          .select("*")
          .eq("contract_id", contractId)
          .order("created_at", { ascending: false }),
      ]);
      if (c.error) throw new Error(c.error.message);
      if (!c.data) return null;
      return {
        contract: c.data as ContractRow,
        clauses: (clauses.data ?? []) as ContractClauseRow[],
        exhibits: (exhibits.data ?? []) as ContractExhibitRow[],
        events: (events.data ?? []) as ContractEventRow[],
      };
    },
  });
}

export function useContractsByQuote(quoteId: string | null | undefined) {
  return useQuery({
    enabled: !!quoteId,
    queryKey: ["contracts-by-quote", quoteId],
    queryFn: async () => {
      const { data, error } = await db
        .from("contracts")
        .select(
          "id, contract_number, title, status, contract_kind, generated_at, issued_at, signed_at, source_quote_id",
        )
        .eq("source_quote_id", quoteId)
        .order("generated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Pick<
        ContractRow,
        | "id"
        | "contract_number"
        | "title"
        | "status"
        | "contract_kind"
        | "generated_at"
        | "issued_at"
        | "signed_at"
        | "source_quote_id"
      >[];
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateDraftContractInput {
  quoteId: string;
}

export interface CreateDraftContractResult {
  contractId: string;
  reusedExistingDraft: boolean;
}

/**
 * Creates a draft contract from an approved quote. If a draft already
 * exists for this quote, returns it instead of creating a duplicate
 * (enforced both in JS and by the partial unique index).
 */
export function useCreateDraftContractFromQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateDraftContractInput,
    ): Promise<CreateDraftContractResult> => {
      // 1. Short-circuit if a draft already exists.
      const { data: existing, error: exErr } = await db
        .from("contracts")
        .select("id")
        .eq("source_quote_id", input.quoteId)
        .eq("status", "draft")
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (existing) {
        return { contractId: existing.id as string, reusedExistingDraft: true };
      }

      // 2. Build the sealed snapshot (one read pass, no live references).
      const snap = await buildContractSnapshot(input.quoteId);

      // 3. Insert the contract row with snapshots frozen in JSON.
      const { data: inserted, error: insErr } = await db
        .from("contracts")
        .insert({
          title: `Contrato — ${snap.proposal.title}`,
          status: "draft",
          contract_kind: "standalone",
          language: "pt-PT",
          currency: snap.proposal.currency,
          source_quote_id: snap.proposal.quote_id,
          source_opportunity_id: snap.proposal.opportunity.id,
          source_company_id: snap.proposal.company.id,
          source_project_id: snap.proposal.pm_project_id,
          snapshot_json: snap,
          ontology_snapshot_json: snap.ontology,
          commercial_snapshot_json: snap.commercial,
          proposal_snapshot_json: snap.proposal,
          resolver_version: CONTRACT_RESOLVER_VERSION,
          generated_at: snap.generated_at,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      const contractId = inserted.id as string;

      // 4. Resolve and persist clauses + exhibits deterministically.
      const clauses = resolveContractClauses(snap).map((c) => ({
        contract_id: contractId,
        clause_key: c.clause_key,
        title: c.title,
        content: c.content,
        sort_order: c.sort_order,
        source_resolver: c.source_resolver,
        source_ontology_component: c.source_ontology_component,
        is_generated: true,
        manual_override: false,
      }));
      const exhibits = resolveContractExhibits(snap).map((e) => ({
        contract_id: contractId,
        exhibit_key: e.exhibit_key,
        title: e.title,
        content_json: e.content_json,
        sort_order: e.sort_order,
        source_type: e.source_type,
        source_id: e.source_id,
      }));

      const [clauseRes, exhibitRes] = await Promise.all([
        clauses.length
          ? db.from("contract_clauses").insert(clauses)
          : Promise.resolve({ error: null }),
        exhibits.length
          ? db.from("contract_exhibits").insert(exhibits)
          : Promise.resolve({ error: null }),
      ]);
      if (clauseRes.error) throw new Error(clauseRes.error.message);
      if (exhibitRes.error) throw new Error(exhibitRes.error.message);

      // 5. Audit event.
      await db.from("contract_events").insert({
        contract_id: contractId,
        event_type: "draft_created",
        metadata: {
          resolver_version: CONTRACT_RESOLVER_VERSION,
          clauses: clauses.length,
          exhibits: exhibits.length,
        },
      });

      return { contractId, reusedExistingDraft: false };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["contracts-by-quote", vars.quoteId] });
    },
  });
}

/**
 * Update a single clause's content. Flips manual_override=true so
 * subsequent regenerations skip this clause.
 */
export function useUpdateClauseContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      contractId: string;
      clauseId: string;
      content: string;
    }) => {
      const { error } = await db
        .from("contract_clauses")
        .update({ content: input.content, manual_override: true })
        .eq("id", input.clauseId);
      if (error) throw new Error(error.message);
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: ["contract", input.contractId] });
    },
  });
}
