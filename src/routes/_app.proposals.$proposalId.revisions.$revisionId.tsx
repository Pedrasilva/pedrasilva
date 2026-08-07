import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { ComposerShell } from "@/components/psa-composer/composer-shell";
import { RevisionProvider } from "@/lib/psa-proposal/revision-context";
import {
  useRestoreRevision,
  useRevision,
} from "@/lib/psa-proposal/use-proposal-revisions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute(
  "/_app/proposals/$proposalId/revisions/$revisionId",
)({
  component: RevisionViewerPage,
});

/**
 * Read-only view of a sent revision. Everything renders from the frozen
 * snapshot captured when the revision was sent — no live quote data is read.
 *
 * The one write available here is an explicit "Restore as new draft", which
 * copies this snapshot back over the single live editable draft.
 */
function RevisionViewerPage() {
  const { proposalId, revisionId } = Route.useParams();
  const revision = useRevision(revisionId);
  const restore = useRestoreRevision(proposalId);
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const revLabel = String(revision.data.revNumber).padStart(2, "0");

  const handleRestore = async () => {
    try {
      await restore.mutateAsync(revisionId);
      setConfirmOpen(false);
      toast.success(`Rascunho restaurado a partir da Rev ${revLabel}.`);
      navigate({
        to: "/proposals/$proposalId/composer",
        params: { proposalId },
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <RevisionProvider revision={revision.data}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <span>
          A ver a <strong>Rev {revLabel}</strong> — só leitura, congelada tal
          como foi enviada.
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          disabled={restore.isPending}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Restaurar como rascunho
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restaurar a Rev {revLabel} como rascunho editável?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  O conteúdo da proposta, os blocos e todos os dados do orçamento
                  (fases, dependências, alocações, mapa de pagamentos, taxas,
                  deslocações e custos de fornecedores) desta revisão vão
                  substituir o rascunho atual.
                </p>
                <p className="font-medium text-destructive">
                  Isto apaga o estado não enviado do rascunho atual e não pode ser
                  desfeito.
                </p>
                <p>
                  As revisões já enviadas mantêm-se congeladas e intactas — nada
                  do que editar a seguir as afeta.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleRestore();
              }}
              disabled={restore.isPending}
            >
              {restore.isPending ? "A restaurar…" : "Restaurar rascunho"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ComposerShell proposalId={proposalId} />
    </RevisionProvider>
  );
}
