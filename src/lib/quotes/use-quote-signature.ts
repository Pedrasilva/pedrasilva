/**
 * Quote signature milestone.
 *
 * A quote becomes a project only after it has been signed. The signature is
 * recorded on `fee_proposals` (signed_at / signed_method / signed_notes), and
 * arrives one of two ways:
 *   - automatically, when the DocuSign envelope for the proposal completes
 *     (see src/routes/api/public/hooks/docusign-connect.ts), or
 *   - manually, via "Mark as signed" for quotes signed on paper or by email.
 *
 * Signature is an attribute of an approved quote, not a `quote_status` value —
 * existing status triggers, locks and reporting stay untouched.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QuoteSignatureMethod = "docusign" | "manual";

export type QuoteSignatureState = {
  quoteId: string;
  isSigned: boolean;
  signedAt: string | null;
  signedMethod: QuoteSignatureMethod | null;
  signedNotes: string | null;
};

export function useQuoteSignature(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-signature", quoteId],
    enabled: !!quoteId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<QuoteSignatureState> => {
      const { data, error } = await db
        .from("fee_proposals")
        .select("id, signed_at, signed_method, signed_notes")
        .eq("id", quoteId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        quoteId: quoteId!,
        isSigned: !!data?.signed_at,
        signedAt: data?.signed_at ?? null,
        signedMethod: (data?.signed_method ?? null) as QuoteSignatureMethod | null,
        signedNotes: data?.signed_notes ?? null,
      };
    },
  });
}

/** Records a manual signature (paper / email) on the quote. */
export function useMarkQuoteSigned(quoteId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { signedAt: string; notes?: string | null }) => {
      if (!quoteId) throw new Error("No quote id");
      const { error } = await db
        .from("fee_proposals")
        .update({
          signed_at: new Date(`${input.signedAt}T12:00:00`).toISOString(),
          signed_method: "manual",
          signed_notes: input.notes?.trim() || null,
        })
        .eq("id", quoteId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-signature", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
    },
  });
}

/** Clears a wrongly recorded signature. */
export function useClearQuoteSignature(quoteId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!quoteId) throw new Error("No quote id");
      const { error } = await db
        .from("fee_proposals")
        .update({ signed_at: null, signed_method: null, signed_notes: null })
        .eq("id", quoteId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-signature", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
    },
  });
}
