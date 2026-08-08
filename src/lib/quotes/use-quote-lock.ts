/**
 * Unified quote lock.
 *
 * One lock for the whole quote family: Gantt stages, allocations, payment
 * schedule, external services, site trips, supplier costs AND the proposal
 * document's text blocks. The DB stamps `fee_proposals.locked_at` as soon as
 * `quote_status` becomes sent/approved/rejected, and BEFORE-write guards on
 * every quote-owned table raise `QUOTE_LOCKED` (or `QUOTE_LOCKED_CONVERTED`
 * once the quote became a project — terminal, never revisable).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QuoteLockState = {
  quoteId: string;
  isLocked: boolean;
  lockedAt: string | null;
  projectId: string | null;
  /** Terminal: converted into a project — never editable again. */
  isConverted: boolean;
  quoteStatus: string | null;
};

export function useQuoteLock(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-lock", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<QuoteLockState> => {
      const { data, error } = await db
        .from("fee_proposals")
        .select("id, is_locked, locked_at, pm_project_id, quote_status")
        .eq("id", quoteId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        quoteId: quoteId!,
        isLocked: !!data?.is_locked || !!data?.locked_at,
        lockedAt: data?.locked_at ?? null,
        projectId: data?.pm_project_id ?? null,
        isConverted: !!data?.pm_project_id,
        quoteStatus: data?.quote_status ?? null,
      };
    },
  });
}

/** Resolves the parent quote id for a proposal (composer route). */
export function useProposalQuoteId(proposalId: string | undefined) {
  return useQuery({
    queryKey: ["psa-proposal-quote-id", proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await db
        .from("psa_proposals")
        .select("quote_id")
        .eq("id", proposalId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.quote_id ?? null;
    },
  });
}

/** Clears the revisable lock so editing resumes (refused once converted). */
export function useUnlockQuoteForRevision(quoteId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!quoteId) throw new Error("No quote id");
      const { error } = await db.rpc("quote_unlock_for_revision", {
        _quote_id: quoteId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errText(err: any): string {
  if (!err) return "";
  return [err.message, err.details, err.hint, typeof err === "string" ? err : ""]
    .filter(Boolean)
    .join(" ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isQuoteLockError(err: any): boolean {
  return /QUOTE_LOCKED/.test(errText(err));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isConvertedLockError(err: any): boolean {
  return /QUOTE_LOCKED_CONVERTED/.test(errText(err));
}

/* --------------------------------------------------------------------- */
/* Blocked-edit bus — any failed write anywhere raises the same prompt.   */
/* --------------------------------------------------------------------- */

type Listener = (converted: boolean) => void;
const listeners = new Set<Listener>();

export function emitQuoteLockBlocked(converted: boolean) {
  listeners.forEach((l) => l(converted));
}

export function onQuoteLockBlocked(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
