/**
 * Stage 5A — Contract Generator Foundation
 * Stage 5B — Lifecycle + Revision Safety
 *
 * React-Query hooks:
 *  - useContract(id)
 *  - useContractsByQuote(qId)
 *  - useCreateDraftContractFromQuote()
 *  - useUpdateClauseContent()          (draft-only guard)
 *  - useRegenerateDraftContract()      (draft-only)
 *  - useIssueContract()                (draft → issued)
 *  - useSignContract()                 (issued → signed)
 *  - useVoidContract()                 (draft → void)
 *  - useCreateRevisionContract()       (issued|signed → new draft revision)
 *
 * Lifecycle invariants:
 *  - Issued/signed contracts are immutable: their snapshot, clauses, and
 *    exhibits never mutate. Only status flips on supersede/void.
 *  - Manually-overridden clauses survive a regeneration; generated clauses
 *    are replaced.
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

      // Fetch lineage siblings (same root) for revision navigation.
      const root = (c.data as ContractRow).root_contract_id ?? c.data.id;
      const { data: lineage } = await db
        .from("contracts")
        .select("id, revision_number, status, generated_at, issued_at, signed_at")
        .eq("root_contract_id", root)
        .order("revision_number", { ascending: true });

      return {
        contract: c.data as ContractRow,
        clauses: (clauses.data ?? []) as ContractClauseRow[],
        exhibits: (exhibits.data ?? []) as ContractExhibitRow[],
        events: (events.data ?? []) as ContractEventRow[],
        lineage: (lineage ?? []) as Array<
          Pick<
            ContractRow,
            "id" | "revision_number" | "status" | "generated_at" | "issued_at" | "signed_at"
          >
        >,
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
          "id, contract_number, title, status, contract_kind, generated_at, issued_at, signed_at, source_quote_id, revision_number, root_contract_id, parent_contract_id",
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
        | "revision_number"
        | "root_contract_id"
        | "parent_contract_id"
      >[];
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function fetchContractOrThrow(contractId: string): Promise<ContractRow> {
  const { data, error } = await db
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Contract ${contractId} not found`);
  return data as ContractRow;
}

function assertStatus(c: ContractRow, allowed: ContractRow["status"][]) {
  if (!allowed.includes(c.status)) {
    throw new Error(`Action not allowed for contract status "${c.status}"`);
  }
}

async function logEvent(
  contractId: string,
  event_type: string,
  metadata: Record<string, unknown> = {},
) {
  await db.from("contract_events").insert({ contract_id: contractId, event_type, metadata });
}

/* -------------------------------------------------------------------------- */
/* Writes — creation                                                          */
/* -------------------------------------------------------------------------- */

export interface CreateDraftContractInput {
  quoteId: string;
}

export interface CreateDraftContractResult {
  contractId: string;
  reusedExistingDraft: boolean;
}

export function useCreateDraftContractFromQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateDraftContractInput,
    ): Promise<CreateDraftContractResult> => {
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

      const snap = await buildContractSnapshot(input.quoteId);

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
          revision_number: 1,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      const contractId = inserted.id as string;

      // First contract in lineage is its own root.
      await db.from("contracts").update({ root_contract_id: contractId }).eq("id", contractId);

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

      await logEvent(contractId, "draft_created", {
        resolver_version: CONTRACT_RESOLVER_VERSION,
        clauses: clauses.length,
        exhibits: exhibits.length,
      });

      return { contractId, reusedExistingDraft: false };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["contracts-by-quote", vars.quoteId] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Writes — clause edit (draft-only)                                          */
/* -------------------------------------------------------------------------- */

export function useUpdateClauseContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      contractId: string;
      clauseId: string;
      content: string;
    }) => {
      const c = await fetchContractOrThrow(input.contractId);
      assertStatus(c, ["draft"]);
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

/* -------------------------------------------------------------------------- */
/* Writes — lifecycle transitions                                             */
/* -------------------------------------------------------------------------- */

/**
 * Regenerate a draft contract from the latest source quote.
 *  - Allowed only when status='draft'.
 *  - Rebuilds the sealed snapshot.
 *  - Replaces all non-manual-override clauses (keeps manual edits).
 *  - Replaces all exhibits (exhibits are mechanical projections, never manual).
 */
export function useRegenerateDraftContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contractId: string }) => {
      const c = await fetchContractOrThrow(input.contractId);
      assertStatus(c, ["draft"]);
      if (!c.source_quote_id) throw new Error("Contract has no source quote.");

      const snap = await buildContractSnapshot(c.source_quote_id);

      // Refresh the sealed snapshot fields + resolver metadata.
      const { error: upErr } = await db
        .from("contracts")
        .update({
          snapshot_json: snap,
          ontology_snapshot_json: snap.ontology,
          commercial_snapshot_json: snap.commercial,
          proposal_snapshot_json: snap.proposal,
          resolver_version: CONTRACT_RESOLVER_VERSION,
          generated_at: snap.generated_at,
        })
        .eq("id", c.id);
      if (upErr) throw new Error(upErr.message);

      // Read current clauses to honour manual_override.
      const { data: existing, error: clErr } = await db
        .from("contract_clauses")
        .select("id, clause_key, manual_override")
        .eq("contract_id", c.id);
      if (clErr) throw new Error(clErr.message);

      const manualKeys = new Set(
        ((existing ?? []) as { clause_key: string; manual_override: boolean }[])
          .filter((r) => r.manual_override)
          .map((r) => r.clause_key),
      );
      const idsToDelete = ((existing ?? []) as { id: string; manual_override: boolean }[])
        .filter((r) => !r.manual_override)
        .map((r) => r.id);

      if (idsToDelete.length) {
        const { error } = await db.from("contract_clauses").delete().in("id", idsToDelete);
        if (error) throw new Error(error.message);
      }

      const fresh = resolveContractClauses(snap)
        .filter((cl) => !manualKeys.has(cl.clause_key))
        .map((cl) => ({
          contract_id: c.id,
          clause_key: cl.clause_key,
          title: cl.title,
          content: cl.content,
          sort_order: cl.sort_order,
          source_resolver: cl.source_resolver,
          source_ontology_component: cl.source_ontology_component,
          is_generated: true,
          manual_override: false,
        }));
      if (fresh.length) {
        const { error } = await db.from("contract_clauses").insert(fresh);
        if (error) throw new Error(error.message);
      }

      // Exhibits — wipe and rebuild.
      await db.from("contract_exhibits").delete().eq("contract_id", c.id);
      const exhibits = resolveContractExhibits(snap).map((e) => ({
        contract_id: c.id,
        exhibit_key: e.exhibit_key,
        title: e.title,
        content_json: e.content_json,
        sort_order: e.sort_order,
        source_type: e.source_type,
        source_id: e.source_id,
      }));
      if (exhibits.length) {
        const { error } = await db.from("contract_exhibits").insert(exhibits);
        if (error) throw new Error(error.message);
      }

      await logEvent(c.id, "regenerated_draft", {
        resolver_version: CONTRACT_RESOLVER_VERSION,
        preserved_manual_clauses: manualKeys.size,
        regenerated_clauses: fresh.length,
        exhibits: exhibits.length,
      });
      return { contractId: c.id };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["contract", res.contractId] });
    },
  });
}

export function useIssueContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contractId: string }) => {
      const c = await fetchContractOrThrow(input.contractId);
      assertStatus(c, ["draft"]);
      const { error } = await db
        .from("contracts")
        .update({
          status: "issued",
          issued_at: new Date().toISOString(),
          resolver_version: CONTRACT_RESOLVER_VERSION,
        })
        .eq("id", c.id);
      if (error) throw new Error(error.message);
      await logEvent(c.id, "issued", { resolver_version: CONTRACT_RESOLVER_VERSION });

      // If this contract was created as a revision of a parent, mark the
      // parent superseded now that the replacement is operational.
      if (c.parent_contract_id) {
        await db
          .from("contracts")
          .update({
            status: "superseded",
            superseded_by_contract_id: c.id,
          })
          .eq("id", c.parent_contract_id)
          .in("status", ["issued", "signed"]);
        await logEvent(c.parent_contract_id, "superseded", { replacement_id: c.id });
      }
      return { contractId: c.id };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["contract", res.contractId] });
      qc.invalidateQueries({ queryKey: ["contracts-by-quote"] });
    },
  });
}

export function useSignContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contractId: string }) => {
      const c = await fetchContractOrThrow(input.contractId);
      assertStatus(c, ["issued"]);
      const { error } = await db
        .from("contracts")
        .update({ status: "signed", signed_at: new Date().toISOString() })
        .eq("id", c.id);
      if (error) throw new Error(error.message);
      await logEvent(c.id, "signed", {});

      // Same supersede-on-activation rule as issuing: a signed replacement
      // also retires its parent if the parent had been left at 'issued'.
      if (c.parent_contract_id) {
        await db
          .from("contracts")
          .update({
            status: "superseded",
            superseded_by_contract_id: c.id,
          })
          .eq("id", c.parent_contract_id)
          .in("status", ["issued", "signed"]);
        await logEvent(c.parent_contract_id, "superseded", { replacement_id: c.id });
      }
      return { contractId: c.id };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["contract", res.contractId] });
      qc.invalidateQueries({ queryKey: ["contracts-by-quote"] });
    },
  });
}

export function useVoidContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contractId: string }) => {
      const c = await fetchContractOrThrow(input.contractId);
      assertStatus(c, ["draft"]);
      const { error } = await db
        .from("contracts")
        .update({ status: "void" })
        .eq("id", c.id);
      if (error) throw new Error(error.message);
      await logEvent(c.id, "voided", {});
      return { contractId: c.id };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["contract", res.contractId] });
      qc.invalidateQueries({ queryKey: ["contracts-by-quote"] });
    },
  });
}

/**
 * Create a new DRAFT revision cloned from an issued/signed contract.
 *  - Copies the sealed snapshot, clauses, and exhibits verbatim.
 *  - Sets parent_contract_id and inherits root_contract_id.
 *  - Increments revision_number relative to the lineage.
 *  - The original contract stays issued/signed until the revision is
 *    itself issued or signed (then the original flips to superseded).
 */
export function useCreateRevisionContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contractId: string }) => {
      const c = await fetchContractOrThrow(input.contractId);
      assertStatus(c, ["issued", "signed"]);
      const rootId = c.root_contract_id ?? c.id;

      // Compute next revision number for this lineage.
      const { data: lineage, error: lErr } = await db
        .from("contracts")
        .select("revision_number")
        .eq("root_contract_id", rootId);
      if (lErr) throw new Error(lErr.message);
      const maxRev = ((lineage ?? []) as { revision_number: number | null }[]).reduce(
        (m, r) => Math.max(m, r.revision_number ?? 1),
        1,
      );
      const nextRev = maxRev + 1;

      const { data: inserted, error: insErr } = await db
        .from("contracts")
        .insert({
          title: c.title,
          status: "draft",
          contract_kind: c.contract_kind,
          language: c.language,
          currency: c.currency,
          source_quote_id: c.source_quote_id,
          source_opportunity_id: c.source_opportunity_id,
          source_company_id: c.source_company_id,
          source_project_id: c.source_project_id,
          snapshot_json: c.snapshot_json,
          ontology_snapshot_json: c.ontology_snapshot_json,
          commercial_snapshot_json: c.commercial_snapshot_json,
          proposal_snapshot_json: c.proposal_snapshot_json,
          resolver_version: c.resolver_version,
          generated_at: new Date().toISOString(),
          parent_contract_id: c.id,
          root_contract_id: rootId,
          revision_number: nextRev,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      const newId = inserted.id as string;

      // Clone clauses (preserve manual_override flag so future regeneration respects it).
      const { data: clauses } = await db
        .from("contract_clauses")
        .select("clause_key, title, content, sort_order, source_resolver, source_ontology_component, is_generated, manual_override")
        .eq("contract_id", c.id);
      if (clauses && clauses.length) {
        const rows = (clauses as Record<string, unknown>[]).map((cl) => ({
          ...cl,
          contract_id: newId,
        }));
        const { error } = await db.from("contract_clauses").insert(rows);
        if (error) throw new Error(error.message);
      }

      const { data: exhibits } = await db
        .from("contract_exhibits")
        .select("exhibit_key, title, content_json, sort_order, source_type, source_id")
        .eq("contract_id", c.id);
      if (exhibits && exhibits.length) {
        const rows = (exhibits as Record<string, unknown>[]).map((e) => ({
          ...e,
          contract_id: newId,
        }));
        const { error } = await db.from("contract_exhibits").insert(rows);
        if (error) throw new Error(error.message);
      }

      await logEvent(newId, "revision_created", {
        parent_contract_id: c.id,
        revision_number: nextRev,
      });
      return { contractId: newId };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["contract", res.contractId] });
      qc.invalidateQueries({ queryKey: ["contracts-by-quote"] });
    },
  });
}
