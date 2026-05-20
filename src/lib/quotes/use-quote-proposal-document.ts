/**
 * Read-only hooks for the generated proposal document layer.
 *
 * - useLatestQuoteProposalDocument: returns the most recent
 *   quote_proposal_documents row for a quote (preferring draft/ready statuses).
 * - useQuoteProposalDocumentBlocks: returns the ordered block instances for
 *   a given proposal document.
 *
 * The two-layer model: master proposal_blocks live in the library; per-quote
 * editable copies live in quote_proposal_document_blocks. These hooks only
 * read the per-quote layer.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type QuoteProposalDocument =
  Database["public"]["Tables"]["quote_proposal_documents"]["Row"];
export type QuoteProposalDocumentBlock =
  Database["public"]["Tables"]["quote_proposal_document_blocks"]["Row"];

const STATUS_PRIORITY: Record<QuoteProposalDocument["status"], number> = {
  draft: 0,
  ready: 1,
  sent: 2,
  accepted: 3,
  archived: 4,
};

export function useLatestQuoteProposalDocument(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-proposal-documents", quoteId, "latest"],
    enabled: Boolean(quoteId),
    queryFn: async (): Promise<QuoteProposalDocument | null> => {
      const { data, error } = await supabase
        .from("quote_proposal_documents")
        .select("*")
        .eq("quote_id", quoteId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) return null;
      const documentIds = data.map((d) => d.id);
      const { data: assembledRows, error: assembledErr } = await supabase
        .from("quote_proposal_document_blocks")
        .select("proposal_document_id")
        .in("proposal_document_id", documentIds)
        .not("assembly_section_id", "is", null);
      if (assembledErr) throw assembledErr;
      const assembledDocumentIds = new Set(
        (assembledRows ?? []).map((r) => r.proposal_document_id),
      );
      // Prefer draft, then ready, then most recent of others.
      // Within the same status class, an ontology-assembled document is the
      // source of truth for editor preview / print export. This prevents a
      // later legacy regeneration from silently becoming the active export.
      const sorted = [...data].sort((a, b) => {
        const pa = STATUS_PRIORITY[a.status] ?? 99;
        const pb = STATUS_PRIORITY[b.status] ?? 99;
        if (pa !== pb) return pa - pb;
        const aa = assembledDocumentIds.has(a.id) ? 0 : 1;
        const ab = assembledDocumentIds.has(b.id) ? 0 : 1;
        if (aa !== ab) return aa - ab;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
      return sorted[0];
    },
  });
}

export function useQuoteProposalDocumentBlocks(documentId: string | undefined) {
  return useQuery({
    queryKey: ["quote-proposal-document-blocks", documentId],
    enabled: Boolean(documentId),
    queryFn: async (): Promise<QuoteProposalDocumentBlock[]> => {
      const { data, error } = await supabase
        .from("quote_proposal_document_blocks")
        .select("*")
        .eq("proposal_document_id", documentId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
