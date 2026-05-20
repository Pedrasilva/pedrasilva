/**
 * Inserts an `AssembledProposal` into an existing proposal document by
 * writing one `quote_proposal_document_blocks` row per `ProposalBlockSeed`.
 *
 * - Inserts fresh assembly rows before any cleanup so a failed cleanup cannot
 *   leave the active document without ontology containers.
 * - Removes prior assembly rows for the same document after the new rows are
 *   safely committed, so repeated assembly stays deterministic.
 * - Marks any pre-existing NON-assembly blocks as `is_included = false`
 *   so the assembled containers become the actual source of truth for
 *   export/print rendering. Rows are preserved (not deleted) so the user
 *   can still re-include them from the editor if they want fragments back.
 *   Without this step the print pipeline would render the legacy generic
 *   blocks (Standard Introduction, Generic Project Description, …) BEFORE
 *   the assembled workplace containers, making the PDF look like the
 *   legacy generic renderer is still the source of truth.
 * - Stores assembly metadata on the new additive columns:
 *     assembly_section_id, assembly_provenance, assembly_locked.
 * - Inserted blocks remain editable / deletable / reorderable.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AssembledProposal } from "./types";

export function useAssembleProposalInsert(documentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { assembled: AssembledProposal; documentId?: string }) => {
      const targetDocumentId = args.documentId ?? documentId;
      if (!targetDocumentId) throw new Error("documentId is required");
      const { assembled } = args;
      if (assembled.input.family !== "workplace") {
        throw new Error(`Unsupported proposal family: ${assembled.input.family}`);
      }
      if (!assembled.input.preset) throw new Error("ontology_preset_code is required");
      if (assembled.containers.length === 0) {
        throw new Error("Assembly planner returned no containers");
      }

      // Read current blocks so we can compute next sort_order and identify
      // cleanup targets. Cleanup happens after insert, never before.
      const { data: existing, error: readErr } = await supabase
        .from("quote_proposal_document_blocks")
        .select("id, sort_order, assembly_section_id, is_included")
        .eq("proposal_document_id", targetDocumentId)
        .order("sort_order", { ascending: false });
      if (readErr) throw readErr;

      const baseOrder = existing?.[0]?.sort_order ?? 0;

      // Identify pre-existing blocks NOT produced by the assembly system.
      // These are the legacy generic blocks seeded by the old proposal
      // generator (Standard Introduction, Generic Project Description, …).
      const legacyIds = (existing ?? [])
        .filter((r) => r.assembly_section_id == null && r.is_included !== false)
        .map((r) => r.id);
      const priorAssemblyIds = (existing ?? [])
        .filter((r) => r.assembly_section_id != null)
        .map((r) => r.id);

      const rows: Array<Record<string, unknown>> = [];
      let i = 1;
      for (const container of assembled.containers) {
        if (!container.enabled) continue;
        for (const block of container.blocks) {
          rows.push({
            proposal_document_id: targetDocumentId,
            block_title: block.title,
            block_type: "editable_text" as const,
            content: block.content,
            sort_order: baseOrder + i * 10,
            is_included: true,
            is_locked: container.locked === "full",
            generated_content: {
              generated_from_assembly: true,
              container_id: container.id,
              section_id: container.sectionId,
              local_id: block.localId,
              payload: block.payload ?? null,
            },
            assembly_section_id: container.sectionId,
            assembly_provenance: container.provenance,
            assembly_locked: container.locked,
          });
          i += 1;
        }
      }

      if (rows.length === 0) {
        throw new Error("Assembly planner returned no insertable blocks");
      }

      const { data: insertedRows, error } = await supabase
        .from("quote_proposal_document_blocks")
        .insert(rows as never)
        .select("id, proposal_document_id, assembly_section_id");
      if (error) throw error;
      if (!insertedRows || insertedRows.length === 0) {
        throw new Error("Assembly insert returned no rows");
      }

      if (priorAssemblyIds.length > 0) {
        const { error: deleteAssemblyErr } = await supabase
          .from("quote_proposal_document_blocks")
          .delete()
          .in("id", priorAssemblyIds);
        if (deleteAssemblyErr) throw deleteAssemblyErr;
      }

      let suppressed = 0;
      if (legacyIds.length > 0) {
        const { error: suppressErr } = await supabase
          .from("quote_proposal_document_blocks")
          .update({ is_included: false })
          .in("id", legacyIds);
        if (suppressErr) throw suppressErr;
        suppressed = legacyIds.length;
      }

      return { inserted: insertedRows.length, suppressed, documentId: targetDocumentId };
    },
    onSuccess: (_data, vars) => {
      const targetDocumentId = vars.documentId ?? documentId;
      if (targetDocumentId) {
        qc.invalidateQueries({
          queryKey: ["quote-proposal-document-blocks", targetDocumentId],
        });
      }
      qc.invalidateQueries({
        queryKey: ["quote-proposal-documents"],
      });
    },
  });
}
