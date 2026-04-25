/**
 * Mutation hooks for editing per-document proposal block instances.
 *
 * Operates only on `quote_proposal_document_blocks`. The master library
 * (`proposal_blocks`) is never modified here.
 *
 * Capabilities:
 * - updateContent: edit the textual `content` (editable_text / legal_reference).
 *   Generated/locked blocks are protected at the call site.
 * - setIncluded:   toggle `is_included`.
 * - reorder:       swap `sort_order` between two adjacent blocks (move up/down).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteProposalDocumentBlock } from "./use-quote-proposal-document";

function invalidate(qc: ReturnType<typeof useQueryClient>, documentId: string) {
  qc.invalidateQueries({
    queryKey: ["quote-proposal-document-blocks", documentId],
  });
}

export function useUpdateBlockContent(documentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { blockId: string; content: string }) => {
      const { error } = await supabase
        .from("quote_proposal_document_blocks")
        .update({ content: args.content })
        .eq("id", args.blockId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (documentId) invalidate(qc, documentId);
    },
  });
}

export function useSetBlockIncluded(documentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { blockId: string; isIncluded: boolean }) => {
      const { error } = await supabase
        .from("quote_proposal_document_blocks")
        .update({ is_included: args.isIncluded })
        .eq("id", args.blockId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (documentId) invalidate(qc, documentId);
    },
  });
}

/**
 * Move a block up or down within its document by swapping `sort_order`
 * with its immediate neighbour. Caller passes the full ordered list so we
 * can compute the swap target without re-querying.
 */
export function useMoveBlock(documentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      blocks: QuoteProposalDocumentBlock[];
      blockId: string;
      direction: "up" | "down";
    }) => {
      const sorted = [...args.blocks].sort((a, b) => a.sort_order - b.sort_order);
      const idx = sorted.findIndex((b) => b.id === args.blockId);
      if (idx < 0) return;
      const targetIdx = args.direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[targetIdx];
      // Two updates; supabase-js has no transaction, but we tolerate a
      // momentary tie because sort_order is not unique-constrained.
      const { error: e1 } = await supabase
        .from("quote_proposal_document_blocks")
        .update({ sort_order: b.sort_order })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("quote_proposal_document_blocks")
        .update({ sort_order: a.sort_order })
        .eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      if (documentId) invalidate(qc, documentId);
    },
  });
}
