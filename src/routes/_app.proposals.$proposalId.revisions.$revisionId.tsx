import { createFileRoute, Link } from "@tanstack/react-router";
import { ComposerShell } from "@/components/psa-composer/composer-shell";
import { RevisionProvider } from "@/lib/psa-proposal/revision-context";
import { useRevision } from "@/lib/psa-proposal/use-proposal-revisions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute(
  "/_app/proposals/$proposalId/revisions/$revisionId",
)({
  component: RevisionViewerPage,
});

/**
 * Read-only view of a sent revision. Everything renders from the frozen
 * snapshot captured when the revision was sent — no live quote data is read
 * and no write is ever performed here.
 */
function RevisionViewerPage() {
  const { proposalId, revisionId } = Route.useParams();
  const revision = useRevision(revisionId);

  if (revision.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        A carregar revisão…
      </div>
    );
  }

  if (revision.isError || !revision.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-500">
        <span>Não foi possível carregar esta revisão.</span>
        <Button asChild variant="outline" size="sm">
          <Link to="/proposals/$proposalId/composer" params={{ proposalId }}>
            Voltar à versão atual
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <RevisionProvider revision={revision.data}>
      <ComposerShell proposalId={proposalId} />
    </RevisionProvider>
  );
}
