/**
 * Inserts an `AssembledProposal` into an existing proposal document by
 * writing one `quote_proposal_document_blocks` row per `ProposalBlockSeed`.
 *
 * - Replaces prior assembly rows for the same document so repeated assembly
 *   stays deterministic instead of stacking duplicate containers.
 * - Appends fresh assembly rows after the existing rows (does not delete
 *   legacy rows).
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
    mutationFn: async (args: { assembled: AssembledProposal }) => {
      if (!documentId) throw new Error("documentId is required");
      const { assembled } = args;
      if (assembled.containers.length === 0) return { inserted: 0, suppressed: 0 };

      // Remove stale assembly output for this same document first. Legacy /
      // manual rows remain preserved, but only one assembled V1 package can
      // be active for export at a time.
      const { error: deleteAssemblyErr } = await supabase
        .from("quote_proposal_document_blocks")
        .delete()
        .eq("proposal_document_id", documentId)
        .not("assembly_section_id", "is", null);
      if (deleteAssemblyErr) throw deleteAssemblyErr;

      // Read remaining blocks so we can (a) compute next sort_order and
      // (b) suppress legacy non-assembly rows.
      const { data: existing, error: readErr } = await supabase
        .from("quote_proposal_document_blocks")
        .select("id, sort_order, assembly_section_id, is_included")
        .eq("proposal_document_id", documentId)
        .order("sort_order", { ascending: false });
      if (readErr) throw readErr;

      const baseOrder = existing?.[0]?.sort_order ?? 0;

      // Identify pre-existing blocks NOT produced by the assembly system.
      // These are the legacy generic blocks seeded by the old proposal
      // generator (Standard Introduction, Generic Project Description, …).
      const legacyIds = (existing ?? [])
        .filter((r) => r.assembly_section_id == null && r.is_included !== false)
        .map((r) => r.id);

      let suppressed = 0;
      if (legacyIds.length > 0) {
        const { error: suppressErr } = await supabase
          .from("quote_proposal_document_blocks")
          .update({ is_included: false })
          .in("id", legacyIds);
        if (suppressErr) throw suppressErr;
        suppressed = legacyIds.length;
      }

      const rows: Array<Record<string, unknown>> = [];
      let i = 1;
      for (const container of assembled.containers) {
        if (!container.enabled) continue;
        for (const block of container.blocks) {
          rows.push({
            proposal_document_id: documentId,
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

      if (rows.length === 0) return { inserted: 0, suppressed };

      const { error } = await supabase
        .from("quote_proposal_document_blocks")
        .insert(rows as never);
      if (error) throw error;
      return { inserted: rows.length, suppressed };
    },
    onSuccess: () => {
      if (documentId) {
        qc.invalidateQueries({
          queryKey: ["quote-proposal-document-blocks", documentId],
        });
      }
    },
  });
}
