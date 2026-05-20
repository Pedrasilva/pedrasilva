/**
 * Inserts an `AssembledProposal` into an existing proposal document by
 * writing one `quote_proposal_document_blocks` row per `ProposalBlockSeed`.
 *
 * - Appends at the end (does not delete pre-existing blocks).
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
      if (assembled.containers.length === 0) return { inserted: 0 };

      const { data: existing, error: readErr } = await supabase
        .from("quote_proposal_document_blocks")
        .select("sort_order")
        .eq("proposal_document_id", documentId)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (readErr) throw readErr;
      const baseOrder = existing?.[0]?.sort_order ?? 0;

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

      if (rows.length === 0) return { inserted: 0 };

      const { error } = await supabase
        .from("quote_proposal_document_blocks")
        .insert(rows as never);
      if (error) throw error;
      return { inserted: rows.length };
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
