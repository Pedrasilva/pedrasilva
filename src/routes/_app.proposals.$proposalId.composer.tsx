import { createFileRoute } from "@tanstack/react-router";
import { ComposerShell } from "@/components/psa-composer/composer-shell";
import { QuoteLockGuard } from "@/components/quotes/quote-lock-guard";
import { useProposalQuoteId } from "@/lib/quotes/use-quote-lock";

import { V2PermissionGate } from "@/components/PermissionGate";
export const Route = createFileRoute("/_app/proposals/$proposalId/composer")({
  head: () => ({ meta: [{ title: "Proposal editor | PSA Hub" }, { name: "description", content: "Compose proposal documents and edit their presentation in PSA Hub." }, { property: "og:title", content: "Proposal editor | PSA Hub" }, { property: "og:description", content: "Compose proposal documents and edit their presentation in PSA Hub." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: GuardedComposerPage,
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

function GuardedComposerPage() {
  return (
    <V2PermissionGate permission="crm.pipeline.edit" scope="assigned">
      <ComposerPage />
    </V2PermissionGate>
  );
}
