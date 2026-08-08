/**
 * Signature requests (DocuSign) attached to sent proposal revisions.
 * Reads go through RLS; the send action goes through a server function.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getSignatureDefaults,
  sendRevisionForSignature,
} from "./signature.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type SignatureStatus = "sent" | "delivered" | "completed" | "declined" | "voided";

export type ProposalSignature = {
  id: string;
  proposal_id: string;
  snapshot_id: string | null;
  docusign_envelope_id: string | null;
  status: SignatureStatus;
  client_signer_name: string | null;
  client_signer_email: string | null;
  psa_signer_name: string | null;
  psa_signer_email: string | null;
  client_signed_at: string | null;
  psa_signed_at: string | null;
  sent_at: string;
  completed_at: string | null;
  status_note: string | null;
  signed_pdf_storage_path: string | null;
  created_at: string;
};

export function useProposalSignatures(proposalId: string | undefined) {
  return useQuery({
    enabled: !!proposalId,
    queryKey: ["psa-proposal-signatures", proposalId],
    queryFn: async (): Promise<ProposalSignature[]> => {
      const { data, error } = await sb
        .from("psa_proposal_signatures")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProposalSignature[];
    },
    refetchInterval: 60_000,
  });
}

export function useSignatureDefaults(proposalId: string | undefined, enabled: boolean) {
  const fn = useServerFn(getSignatureDefaults);
  return useQuery({
    enabled: !!proposalId && enabled,
    queryKey: ["psa-signature-defaults", proposalId],
    queryFn: () => fn({ data: { proposalId: proposalId! } }),
    staleTime: 60_000,
  });
}

export function useSendForSignature(proposalId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(sendRevisionForSignature);
  return useMutation({
    mutationFn: (args: {
      snapshotId: string;
      clientName: string;
      clientEmail: string;
    }) => fn({ data: { proposalId: proposalId!, ...args } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["psa-proposal-signatures", proposalId] });
    },
  });
}

/** Human-facing status line for a signature request. */
export function describeSignature(s: ProposalSignature): {
  tone: "pending" | "success" | "warning";
  label: string;
} {
  const clientName = s.client_signer_name ?? "cliente";
  const psaName = s.psa_signer_name ?? "PSA";
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" }) : "";
  switch (s.status) {
    case "completed":
      return { tone: "success", label: `Assinada por ambas as partes em ${date(s.completed_at)}` };
    case "declined":
      return { tone: "warning", label: `Recusada${s.status_note ? ` — ${s.status_note}` : ""}` };
    case "voided":
      return { tone: "warning", label: `Anulada${s.status_note ? ` — ${s.status_note}` : ""}` };
    default:
      return s.client_signed_at
        ? { tone: "pending", label: `A aguardar contra-assinatura de ${psaName}` }
        : { tone: "pending", label: `Enviada para assinatura — a aguardar ${clientName}` };
  }
}
