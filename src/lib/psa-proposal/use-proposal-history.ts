/**
 * Version history hooks for the PSA Proposal Composer.
 *
 * Snapshots store a full JSON copy of the proposal + its blocks so we can
 * restore a past version if content is lost. Auto-snapshots are throttled
 * client-side (one per ~5 min of edits) plus a manual "Guardar versão" button.
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PsaProposal, PsaProposalBlock } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type PsaProposalSnapshot = {
  id: string;
  proposal_id: string;
  label: string | null;
  reason: string | null;
  snapshot: { proposal: PsaProposal; blocks: PsaProposalBlock[] };
  created_by: string | null;
  created_at: string;
};

export function useProposalSnapshots(proposalId: string | undefined) {
  return useQuery({
    enabled: !!proposalId,
    queryKey: ["psa-proposal-snapshots", proposalId],
    queryFn: async (): Promise<PsaProposalSnapshot[]> => {
      const { data, error } = await sb
        .from("psa_proposal_snapshots")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as PsaProposalSnapshot[];
    },
  });
}

export function useCreateSnapshot(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { label?: string; reason?: string }) => {
      if (!proposalId) throw new Error("No proposal id");
      const [{ data: proposal, error: pErr }, { data: blocks, error: bErr }] =
        await Promise.all([
          sb.from("psa_proposals").select("*").eq("id", proposalId).single(),
          sb
            .from("psa_proposal_blocks")
            .select("*")
            .eq("proposal_id", proposalId)
            .order("sort_order", { ascending: true }),
        ]);
      if (pErr) throw pErr;
      if (bErr) throw bErr;
      const { data: userData } = await sb.auth.getUser();
      const { error } = await sb.from("psa_proposal_snapshots").insert({
        proposal_id: proposalId,
        label: args.label ?? null,
        reason: args.reason ?? "auto",
        snapshot: { proposal, blocks: blocks ?? [] },
        created_by: userData?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-snapshots", proposalId] });
    },
  });
}

export function useRestoreSnapshot(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (snap: PsaProposalSnapshot) => {
      if (!proposalId) throw new Error("No proposal id");
      // Safety net: snapshot the current state before overwriting it.
      const [{ data: curProposal }, { data: curBlocks }] = await Promise.all([
        sb.from("psa_proposals").select("*").eq("id", proposalId).single(),
        sb
          .from("psa_proposal_blocks")
          .select("*")
          .eq("proposal_id", proposalId)
          .order("sort_order", { ascending: true }),
      ]);
      await sb.from("psa_proposal_snapshots").insert({
        proposal_id: proposalId,
        label: "Antes de restaurar",
        reason: "pre-restore",
        snapshot: { proposal: curProposal, blocks: curBlocks ?? [] },
      });

      // Replace blocks with snapshot contents.
      await sb.from("psa_proposal_blocks").delete().eq("proposal_id", proposalId);
      const toInsert = (snap.snapshot.blocks ?? []).map((b) => ({
        proposal_id: proposalId,
        sort_order: b.sort_order,
        block_type: b.block_type,
        title: b.title,
        source_type: b.source_type,
        source_ref: b.source_ref,
        content_rich: b.content_rich,
        contract_relevance: b.contract_relevance,
        is_visible: b.is_visible,
        is_locked: b.is_locked,
      }));
      if (toInsert.length) {
        const { error } = await sb.from("psa_proposal_blocks").insert(toInsert);
        if (error) throw error;
      }

      // Restore proposal-level fields too (title, status, style settings).
      const p = snap.snapshot.proposal;
      if (p) {
        await sb
          .from("psa_proposals")
          .update({
            title: p.title,
            status: p.status,
            style_settings: p.style_settings,
            quote_id: p.quote_id,
          })
          .eq("id", proposalId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal", proposalId] });
      qc.invalidateQueries({ queryKey: ["psa-proposal-blocks", proposalId] });
      qc.invalidateQueries({ queryKey: ["psa-proposal-snapshots", proposalId] });
    },
  });
}

export function useDeleteSnapshot(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("psa_proposal_snapshots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-snapshots", proposalId] });
    },
  });
}

/**
 * Throttled auto-snapshot trigger. Call `mark()` whenever the proposal changes;
 * a snapshot is created at most once per `minIntervalMs` (default 5 min).
 */
export function useAutoSnapshotTrigger(
  proposalId: string | undefined,
  minIntervalMs = 5 * 60 * 1000,
) {
  const create = useCreateSnapshot(proposalId);
  const storageKey = proposalId ? `psa-snap-last:${proposalId}` : null;
  return useCallback(() => {
    if (!proposalId || !storageKey) return;
    try {
      const last = Number(localStorage.getItem(storageKey) ?? 0);
      const now = Date.now();
      if (now - last < minIntervalMs) return;
      localStorage.setItem(storageKey, String(now));
      create.mutate({ reason: "auto" });
    } catch {
      /* ignore */
    }
  }, [proposalId, storageKey, minIntervalMs, create]);
}
