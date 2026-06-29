import { createFileRoute } from "@tanstack/react-router";
import { ComposerShell } from "@/components/psa-composer/composer-shell";

export const Route = createFileRoute("/_app/proposals/$proposalId/composer")({
  component: ComposerPage,
});

function ComposerPage() {
  const { proposalId } = Route.useParams();
  return <ComposerShell proposalId={proposalId} />;
}
