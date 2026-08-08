import { createFileRoute } from "@tanstack/react-router";
import { ComposerShell } from "@/components/psa-composer/composer-shell";
import { QuoteLockGuard } from "@/components/quotes/quote-lock-guard";
import { useProposalQuoteId } from "@/lib/quotes/use-quote-lock";

export const Route = createFileRoute("/_app/proposals/$proposalId/composer")({
  component: ComposerPage,
});

function ComposerPage() {
  const { proposalId } = Route.useParams();
  const quoteId = useProposalQuoteId(proposalId);
  return (
    <div className="space-y-3">
      <QuoteLockGuard quoteId={quoteId.data ?? undefined} />
      <ComposerShell proposalId={proposalId} />
    </div>
  );
}
