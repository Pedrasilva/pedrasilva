/**
 * Proposal revision hooks — "sent" snapshots with attached PDF artifact.
 *
 * A revision is an immutable copy (kind='sent') of the proposal + blocks
 * at the moment the user clicks "Send". Each revision has an auto-increment
 * `rev_number` (0-based) and a PDF stored in the `proposal-pdfs` bucket.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  snapshot: { proposal: PsaProposal; blocks: PsaProposalBlock[] };
  created_by: string | null;
  created_at: string;
};

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
 * Number of the NEXT revision that would be produced by "Send Proposal".
 * (0 if none has been sent yet.)
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
    mutationFn: async (args: { pdfBlob: Blob; filename: string; revNumber: number }) => {
      if (!proposalId) throw new Error("No proposal id");
      const { pdfBlob, filename, revNumber } = args;

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
        snapshot: { proposal, blocks: blocks ?? [] },
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
