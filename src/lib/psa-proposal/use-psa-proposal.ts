/**
 * React Query hooks for the PSA Proposal Composer.
 *
 * Reads and writes psa_proposals, psa_proposal_blocks and psa_block_library
 * through the browser supabase client. Types are hand-rolled (see ./types)
 * until the generated Database types are refreshed.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_LETTER_SETTINGS } from './letter';
import { letterFieldDefaults } from './letter-fields';
import { resolveMaster } from './master-page';
import { useHistoricalRevision } from "./revision-context";
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
  const historical = useHistoricalRevision();
  const query = useQuery({
    enabled: !!id && !historical,
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
  if (historical?.revision.payload.proposal) {
    return {
      ...query,
      data: historical.revision.payload.proposal,
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
    } as typeof query;
  }
  return query;
}

export function useProposalBlocks(proposalId: string | undefined) {
  const historical = useHistoricalRevision();
  const query = useQuery({
    enabled: !!proposalId && !historical,
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
  if (historical) {
    return {
      ...query,
      data: historical.revision.payload.blocks ?? [],
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
    } as typeof query;
  }
  return query;
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
      const settings = proposal.style_settings.letterSettings ?? DEFAULT_LETTER_SETTINGS;
      const editorialDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const letterFields=letterFieldDefaults({},undefined,resolveMaster(proposal.style_settings),proposal.language==='en'?'en':'pt-PT',editorialDate);
      const rows = [
        {kind:'cover',default_title:'Capa',default_source_type:'mixed',default_source_ref:{},default_content_rich:{},default_contract_relevance:'proposal_only'},
        {kind:'letter',default_title:'Carta',default_source_type:'mixed',default_source_ref:{},default_content_rich:{html:settings.templates[proposal.language] ?? DEFAULT_LETTER_SETTINGS.templates[proposal.language==='en'?'en':'pt-PT'],letterSettings:settings,letterVersion:2,letterFields,letterNeedsSources:true},default_contract_relevance:'proposal_only'},
        ...(lib ?? []).filter((row:PsaLibraryEntry)=>row.kind!=='cover' && row.kind!=='letter'),
      ];
      const seed = rows.map((row: PsaLibraryEntry, idx: number) => ({
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
      qc.invalidateQueries({ queryKey: ["quote-main-proposal"] });
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
    mutationFn: async (args: { lib: PsaLibraryEntry; afterOrder: number }): Promise<{ id: string }> => {
      if (!proposalId) throw new Error("No proposal id");
      const { data, error } = await sb
        .from("psa_proposal_blocks")
        .insert({
          proposal_id: proposalId,
          sort_order: args.afterOrder + 5,
          block_type: args.lib.kind,
          title: args.lib.default_title,
          source_type: args.lib.default_source_type,
          source_ref: args.lib.default_source_ref,
          content_rich: args.lib.default_content_rich,
          contract_relevance: args.lib.default_contract_relevance,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-blocks", proposalId] });
    },
  });
}

export function useImportTemplateBlocks(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string): Promise<number> => {
      if (!proposalId) throw new Error("No proposal id");
      const { data, error } = await sb.rpc("psa_import_template_blocks", {
        _proposal_id: proposalId,
        _template_id: templateId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-blocks", proposalId] });
      qc.invalidateQueries({ queryKey: ["psa-proposal", proposalId] });
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
  letter: "Carta",
  index: "Índice",
  about: "Sobre a PSA",
  scope: "Âmbito",
  stage_list: "Lista de Fases",
  stage_item: "Fase",
  timeline: "Cronograma",
  gantt_design: "Gantt — Projeto",
  gantt_construction: "Gantt — Obra",
  gantt_partial: "Gantt Parcial",
  consultants: "Consultores",
  fee_table: "Tabela de Honorários",
  supplier_fee_table: "Tabela de Honorários — Fornecedores",
  optional_fee_table: "Tabela de Honorários — Opcionais",

  construction_fee: "Honorários em Obra",
  travel_expenses: "Despesas de Deslocação",
  billable_hourly_rate: "Valor/hora Facturável",
  payment_terms: "Condições de Pagamento",
  payment_schedule: "Payment_schedule_construction",
  additional_services: "Serviços Adicionais",
  general: "Considerações Gerais",
  suspension: "Suspensão / Rescisão",
  exclusions: "Exclusões",
  acceptance: "Validade e Aceitação",
  custom_text: "Texto Livre",
  image: "Imagem",
  page_break: "Quebra de Página",
  appendix_index: "Índice de Anexos",
  appendix_payment_schedule: "Anexo — Cronograma de Pagamentos",
  appendix_gantt: "Anexo — Programa do Projeto",
  appendix_general_terms: "Anexo — Termos Gerais PSA",
};

export type { PsaContractRelevance, PsaSourceType };
