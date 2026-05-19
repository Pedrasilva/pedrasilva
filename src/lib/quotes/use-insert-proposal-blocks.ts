/**
 * Insert helper for the ontology-aware proposal intelligence panel.
 *
 * Appends one or more editable_text blocks to an existing proposal document.
 * Provenance (resolver source, section/phase/clause keys, resolver version)
 * is stored in `generated_content` so the panel can detect "already
 * inserted" blocks across re-resolutions without changing the schema.
 *
 * Generated blocks are NOT locked — they behave like every other block:
 * editable, reorderable, includable/excludable.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const RESOLVER_VERSION = "ontology.v1";

export interface InsertableBlock {
  title: string;
  content: string;
  ontologyKey: string;
  kind:
    | "section"
    | "cover_page"
    | "cover_letter"
    | "phase_narrative"
    | "clause"
    | "commercial_note";
  relatedPhaseCode?: string | null;
  relatedClauseKey?: string | null;
  relatedSectionId?: string | null;
}

export function useInsertProposalBlocks(documentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { blocks: InsertableBlock[] }) => {
      if (!documentId || args.blocks.length === 0) return;

      const { data: existing, error: readErr } = await supabase
        .from("quote_proposal_document_blocks")
        .select("sort_order")
        .eq("proposal_document_id", documentId)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (readErr) throw readErr;
      const baseOrder = existing?.[0]?.sort_order ?? 0;

      const rows = args.blocks.map((b, i) => ({
        proposal_document_id: documentId,
        block_title: b.title,
        block_type: "editable_text" as const,
        content: b.content,
        sort_order: baseOrder + (i + 1) * 10,
        is_included: true,
        is_locked: false,
        generated_content: {
          generated_from_resolver: true,
          resolver_version: RESOLVER_VERSION,
          ontology_section_key: b.ontologyKey,
          ontology_kind: b.kind,
          related_phase_code: b.relatedPhaseCode ?? null,
          related_clause_key: b.relatedClauseKey ?? null,
          related_section_id: b.relatedSectionId ?? null,
        },
      }));

      const { error } = await supabase
        .from("quote_proposal_document_blocks")
        .insert(rows);
      if (error) throw error;
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

/** Reads ontology key off a block's `generated_content`, if present. */
export function blockOntologyKey(genContent: unknown): string | null {
  if (!genContent || typeof genContent !== "object") return null;
  const k = (genContent as Record<string, unknown>).ontology_section_key;
  return typeof k === "string" ? k : null;
}
