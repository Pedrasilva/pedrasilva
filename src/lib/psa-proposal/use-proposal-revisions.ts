/**
 * Proposal revision hooks — "sent" snapshots with attached PDF artifact.
 *
 * A revision is an immutable copy (kind='sent') of the proposal + blocks
 * at the moment the user clicks "Send". Each revision has an auto-increment
 * `rev_number` (0-based) and a PDF stored in the `proposal-pdfs` bucket.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureQuoteData } from "./snapshot-capture";
import type { FrozenQuoteData, HistoricalRevision } from "./revision-context";
import type { PsaProposal, PsaProposalBlock } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type ProposalRevision = {
  id: string;
  proposal_id: string;
  kind: "sent";
  rev_number: number;
  label: string | null;
  pdf_storage_path: string | null;
  pdf_filename: string | null;
  pdf_mime: string | null;
  snapshot: {
    proposal: PsaProposal;
    blocks: PsaProposalBlock[];
    quote_data?: FrozenQuoteData | null;
  };
  /** Set when this revision was sent after restoring an earlier revision. */
  restored_from_snapshot_id: string | null;
  created_by: string | null;
  created_at: string;
};

/**
 * Restores a past sent revision into the single live editable draft.
 *
 * DESTRUCTIVE for the current unsent draft; already-sent revisions stay
 * frozen and untouched. Lineage is stamped on the proposal and carried onto
 * the next revision that gets sent.
 */
export function useRestoreRevision(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const { error } = await sb.rpc("psa_restore_revision", {
        _snapshot_id: snapshotId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal", proposalId] });
      qc.invalidateQueries({ queryKey: ["psa-proposal-blocks", proposalId] });
      qc.invalidateQueries({ queryKey: ["psa-proposal-revisions", proposalId] });
      qc.invalidateQueries();
    },
  });
}

/** True when this revision carries a frozen quote payload it can render from. */
export function revisionIsViewable(r: ProposalRevision): boolean {
  return !!r.snapshot?.quote_data?.resolved;
}

/** Loads a single sent revision and shapes it for `RevisionProvider`. */
export function useRevision(revisionId: string | undefined) {
  return useQuery({
    enabled: !!revisionId,
    queryKey: ["psa-proposal-revision", revisionId],
    queryFn: async (): Promise<HistoricalRevision> => {
      const { data, error } = await sb
        .from("psa_proposal_snapshots")
        .select("*")
        .eq("id", revisionId)
        .single();
      if (error) throw error;
      const r = data as ProposalRevision;
      return {
        id: r.id,
        revNumber: r.rev_number,
        sentAt: r.created_at,
        pdfStoragePath: r.pdf_storage_path,
        pdfFilename: r.pdf_filename,
        payload: {
          proposal: r.snapshot?.proposal,
          blocks: r.snapshot?.blocks ?? [],
          quote_data: r.snapshot?.quote_data ?? null,
        },
      };
    },
  });
}


export function useProposalRevisions(proposalId: string | undefined) {
  return useQuery({
    enabled: !!proposalId,
    queryKey: ["psa-proposal-revisions", proposalId],
    queryFn: async (): Promise<ProposalRevision[]> => {
      const { data, error } = await sb
        .from("psa_proposal_snapshots")
        .select("*")
        .eq("proposal_id", proposalId)
        .eq("kind", "sent")
        .order("rev_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProposalRevision[];
    },
  });
}

/**
 * Display-only hint for the *likely* next revision number (used for labels
 * and the pre-filled filename). The authoritative number is allocated
 * server-side at send time by `psa_next_rev_number`.
 */
export function useNextRevNumber(proposalId: string | undefined) {
  const q = useProposalRevisions(proposalId);
  const highest = (q.data ?? []).reduce(
    (max, r) => (r.rev_number > max ? r.rev_number : max),
    -1,
  );
  return {
    ...q,
    nextRev: highest + 1,
    currentSentCount: (q.data ?? []).length,
  };
}

function safePathSegment(s: string): string {
  return s.replace(/[^a-z0-9\-_\s]/gi, "").replace(/\s+/g, "-").slice(0, 80) || "proposal";
}

export function useSendProposal(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { pdfBlob: Blob; filename: string }) => {
      if (!proposalId) throw new Error("No proposal id");
      const { pdfBlob, filename } = args;

      // Fetch current proposal + blocks for the immutable snapshot payload.
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
      if (proposal?.locked_at) {
        throw new Error("Proposta bloqueada — não é possível enviar novas revisões.");
      }

      // Atomic, collision-proof revision number (server-side).
      const { data: revData, error: revErr } = await sb.rpc("psa_next_rev_number", {
        _proposal_id: proposalId,
      });
      if (revErr) throw revErr;
      const revNumber = Number(revData ?? 0);

      // Freeze the full quote payload at this exact moment.
      const quoteData = await captureQuoteData(proposal?.quote_id ?? null);

      // Upload PDF.
      const revLabel = String(revNumber).padStart(2, "0");
      const storagePath = `${proposalId}/rev-${revLabel}-${safePathSegment(filename)}.pdf`;
      const { error: upErr } = await sb.storage
        .from("proposal-pdfs")
        .upload(storagePath, pdfBlob, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (upErr) throw upErr;

      // Insert the sent snapshot.
      const { data: userData } = await sb.auth.getUser();
      const { error: snapErr } = await sb.from("psa_proposal_snapshots").insert({
        proposal_id: proposalId,
        label: `Rev ${revLabel}`,
        reason: "sent",
        kind: "sent",
        rev_number: revNumber,
        pdf_storage_path: storagePath,
        pdf_filename: `${filename}.pdf`,
        pdf_mime: "application/pdf",
        snapshot: { proposal, blocks: blocks ?? [], quote_data: quoteData },
        created_by: userData?.user?.id ?? null,
      });

      if (snapErr) {
        // Roll back the uploaded file if snapshot insert failed.
        await sb.storage.from("proposal-pdfs").remove([storagePath]);
        throw snapErr;
      }

      // Mark proposal as sent (bumps status only if still draft/review).
      const nextStatus =
        proposal.status === "draft" || proposal.status === "review"
          ? "sent"
          : proposal.status;
      await sb
        .from("psa_proposals")
        .update({ status: nextStatus, sent_at: new Date().toISOString() })
        .eq("id", proposalId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-revisions", proposalId] });
      qc.invalidateQueries({ queryKey: ["psa-proposal", proposalId] });
      qc.invalidateQueries({ queryKey: ["psa-proposals"] });
    },
  });
}

export async function getRevisionPdfUrl(storagePath: string): Promise<string> {
  const { data, error } = await sb.storage
    .from("proposal-pdfs")
    .createSignedUrl(storagePath, 300);
  if (error) throw error;
  return data.signedUrl as string;
}

export function useSetProposalOutcome(proposalId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (outcome: "won" | "lost") => {
      if (!proposalId) throw new Error("No proposal id");
      const nextStatus = outcome === "won" ? "accepted" : "declined";
      // The DB trigger stamps locked_at + outcome automatically.
      const { error } = await sb
        .from("psa_proposals")
        .update({ status: nextStatus })
        .eq("id", proposalId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal", proposalId] });
      qc.invalidateQueries({ queryKey: ["psa-proposals"] });
    },
  });
}
