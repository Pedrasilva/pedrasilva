/**
 * Revision history surfaced from the quote itself — a quote and its sent
 * revisions are one continuous history, not two disconnected objects.
 * Thin wrapper that resolves the quote's proposal and reuses VersionsPanel.
 */
import { useMainProposal } from "@/lib/psa-proposal/use-main-proposal";
import { VersionsPanel } from "@/components/psa-composer/versions-panel";
import type { PsaProposal } from "@/lib/psa-proposal/types";
import { useQuoteLock } from "@/lib/quotes/use-quote-lock";

export function QuoteRevisionsButton({
  quoteId,
  open,
  onOpenChange,
  hideTrigger = false,
}: {
  quoteId: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  hideTrigger?: boolean;
}) {
  const lock = useQuoteLock(quoteId);
  const proposal = useMainProposal(quoteId);

  if (!proposal.data) return null;
  // The quote owns the lock now — mirror it onto the panel's view model.
  const view = {
    ...proposal.data,
    locked_at: lock.data?.isLocked ? (lock.data.lockedAt ?? proposal.data.locked_at) : null,
  } as PsaProposal;
  return (
    <VersionsPanel
      key={proposal.data.id}
      proposal={view}
      open={open}
      onOpenChange={onOpenChange}
      hideTrigger={hideTrigger}
    />
  );
}
