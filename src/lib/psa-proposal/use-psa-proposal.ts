/**
 * React Query hooks for the PSA Proposal Composer.
 *
 * Reads and writes psa_proposals, psa_proposal_blocks and psa_block_library
 * through the browser supabase client. Types are hand-rolled (see ./types)
 * until the generated Database types are refreshed.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  PsaLibraryEntry,
  PsaProposal,
  PsaProposalBlock,
  PsaBlockType,
  PsaContractRelevance,
  PsaSourceType,
} from "./types";

// Casts: new tables aren't in generated Database yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// -------------------- queries --------------------

export function useProposal(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["psa-proposal", id],
    queryFn: async (): Promise<PsaProposal> => {
      const { data, error } = await sb
        .from("psa_proposals")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as PsaProposal;
    },
  });
}

export function useProposalBlocks(proposalId: string | undefined) {
  return useQuery({
    enabled: !!proposalId,
    queryKey: ["psa-proposal-blocks", proposalId],
    queryFn: async (): Promise<PsaProposalBlock[]> => {
      const { data, error } = await sb
        .from("psa_proposal_blocks")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PsaProposalBlock[];
    },
  });
}

export function useBlockLibrary() {
  return useQuery({
    queryKey: ["psa-block-library"],
    queryFn: async (): Promise<PsaLibraryEntry[]> => {
      const { data, error } = await sb
        .from("psa_block_library")
        .select("*")
        .order("sort_hint", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PsaLibraryEntry[];
    },
  });
}

export function useProposalList() {
  return useQuery({
    queryKey: ["psa-proposals"],
    queryFn: async (): Promise<PsaProposal[]> => {
      const { data, error } = await sb
        .from("psa_proposals")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PsaProposal[];
    },
  });
}

// -------------------- mutations --------------------

export function useCreateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { title?: string; quoteId?: string | null }) => {
      const { data: ins, error } = await sb
        .from("psa_proposals")
        .insert({
          title: args.title ?? "Nova Proposta",
          quote_id: args.quoteId ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      const proposal = ins as PsaProposal;

      // Seed canonical PSA blocks from the library.
      const { data: lib, error: libErr } = await sb
        .from("psa_block_library")
        .select("*")
        .order("sort_hint", { ascending: true });
      if (libErr) throw libErr;
      const seed = (lib ?? []).map((row: PsaLibraryEntry, idx: number) => ({
        proposal_id: proposal.id,
        sort_order: (idx + 1) * 10,
        block_type: row.kind,
        title: row.default_title,
        source_type: row.default_source_type,
        source_ref: row.default_source_ref,
        content_rich: row.default_content_rich,
        contract_relevance: row.default_contract_relevance,
      }));
      if (seed.length) {
        const { error: blkErr } = await sb.from("psa_proposal_blocks").insert(seed);
        if (blkErr) throw blkErr;
      }
      return proposal;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposals"] });
    },
  });
}

export function useUpdateProposal(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<PsaProposal>) => {
      if (!id) throw new Error("No proposal id");
      const { error } = await sb.from("psa_proposals").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal", id] });
      qc.invalidateQueries({ queryKey: ["psa-proposals"] });
    },
  });
}

export function useUpdateBlock(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<PsaProposalBlock> }) => {
      const { error } = await sb
        .from("psa_proposal_blocks")
        .update(args.patch)
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-blocks", proposalId] });
    },
  });
}

export function useDeleteBlock(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("psa_proposal_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-blocks", proposalId] });
    },
  });
}

export function useDuplicateBlock(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (block: PsaProposalBlock) => {
      const { error } = await sb.from("psa_proposal_blocks").insert({
        proposal_id: block.proposal_id,
        sort_order: block.sort_order + 5,
        block_type: block.block_type,
        title: block.title + " (cópia)",
        source_type: block.source_type,
        source_ref: block.source_ref,
        content_rich: block.content_rich,
        contract_relevance: block.contract_relevance,
        is_visible: block.is_visible,
        is_locked: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-blocks", proposalId] });
    },
  });
}

export function useAddLibraryBlock(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { lib: PsaLibraryEntry; afterOrder: number }) => {
      if (!proposalId) throw new Error("No proposal id");
      const { error } = await sb.from("psa_proposal_blocks").insert({
        proposal_id: proposalId,
        sort_order: args.afterOrder + 5,
        block_type: args.lib.kind,
        title: args.lib.default_title,
        source_type: args.lib.default_source_type,
        source_ref: args.lib.default_source_ref,
        content_rich: args.lib.default_content_rich,
        contract_relevance: args.lib.default_contract_relevance,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-blocks", proposalId] });
    },
  });
}

export function useReorderBlocks(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: PsaProposalBlock[]) => {
      // Re-stamp sort_order in steps of 10 to keep room for inserts.
      await Promise.all(
        ordered.map((b, idx) =>
          sb
            .from("psa_proposal_blocks")
            .update({ sort_order: (idx + 1) * 10 })
            .eq("id", b.id),
        ),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-blocks", proposalId] });
    },
  });
}

export const BLOCK_TYPE_LABEL: Record<PsaBlockType, string> = {
  cover: "Capa",
  index: "Índice",
  about: "Sobre a PSA",
  scope: "Âmbito",
  stage_list: "Lista de Fases",
  stage_item: "Fase",
  timeline: "Cronograma",
  consultants: "Consultores",
  fee_table: "Tabela de Honorários",
  construction_fee: "Honorários em Obra",
  payment_terms: "Condições de Pagamento",
  payment_schedule: "Plano de Pagamentos",
  additional_services: "Serviços Adicionais",
  general: "Considerações Gerais",
  suspension: "Suspensão / Rescisão",
  exclusions: "Exclusões",
  acceptance: "Validade e Aceitação",
  custom_text: "Texto Livre",
  page_break: "Quebra de Página",
};

export type { PsaContractRelevance, PsaSourceType };
