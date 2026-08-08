/**
 * Revision history surfaced from the quote itself — a quote and its sent
 * revisions are one continuous history, not two disconnected objects.
 * Thin wrapper that resolves the quote's proposal and reuses VersionsPanel.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { VersionsPanel } from "@/components/psa-composer/versions-panel";
import type { PsaProposal } from "@/lib/psa-proposal/types";
import { useQuoteLock } from "@/lib/quotes/use-quote-lock";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function QuoteRevisionsButton({ quoteId }: { quoteId: string }) {
  const lock = useQuoteLock(quoteId);
  const proposal = useQuery({
    queryKey: ["psa-proposal-for-quote", quoteId],
    queryFn: async (): Promise<PsaProposal | null> => {
      const { data, error } = await sb
        .from("psa_proposals")
        .select("*")
        .eq("quote_id", quoteId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return (data && data[0]) ?? null;
    },
  });

  if (!proposal.data) return null;
  // The quote owns the lock now — mirror it onto the panel's view model.
  const view = {
    ...proposal.data,
    locked_at: lock.data?.isLocked ? (lock.data.lockedAt ?? proposal.data.locked_at) : null,
  } as PsaProposal;
  return <VersionsPanel proposal={view} />;
}
