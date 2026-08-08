/**
 * Quote lock guard — banner + prompt-to-revise dialog.
 *
 * Mounted once per quote workspace (and on the standalone composer route).
 * It listens for any write rejected by the DB lock guards and, instead of a
 * raw error, offers the user the one legitimate way forward: create a new
 * revision (which clears the lock). Once the quote has been converted into a
 * project the lock is terminal — we only point at the project.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
  onQuoteLockBlocked,
  useQuoteLock,
  useUnlockQuoteForRevision,
} from "@/lib/quotes/use-quote-lock";

export function QuoteLockGuard({
  quoteId,
  showBanner = true,
}: {
  quoteId: string | undefined;
  showBanner?: boolean;
}) {
  const lock = useQuoteLock(quoteId);
  const unlock = useUnlockQuoteForRevision(quoteId);
  const [open, setOpen] = useState(false);

  useEffect(() => onQuoteLockBlocked(() => setOpen(true)), []);

  if (!quoteId || !lock.data?.isLocked) return null;
  const converted = lock.data.isConverted;
  const projectId = lock.data.projectId;

  return (
    <>
      {showBanner && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-medium">
              {converted
                ? "Proposta bloqueada — convertida em projecto"
                : "Proposta bloqueada — foi enviada"}
            </p>
            <p className="text-xs text-amber-800/90 dark:text-amber-200/90">
              {converted
                ? "O plano vivo passou para o módulo de Projectos. Esta proposta é agora apenas o registo contratual e não pode voltar a ser editada."
                : "Gantt, honorários, alocações, serviços externos e o texto da proposta estão bloqueados. Para continuar a editar, crie uma nova revisão."}
            </p>
            {converted && projectId && (
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:no-underline"
              >
                <ExternalLink className="h-3 w-3" /> Abrir projecto
              </Link>
            )}
            {!converted && (
              <div className="pt-1">
                <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                  Criar nova revisão
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {converted ? "Proposta convertida em projecto" : "Proposta bloqueada"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {converted
                ? "Esta proposta deu origem a um projecto e é agora o registo contratual permanente. Todas as alterações passam a ser feitas no módulo de Projectos."
                : "Esta proposta está bloqueada porque foi enviada. Quer criar uma nova revisão para continuar a editar? A revisão enviada mantém-se congelada no histórico."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
            {!converted && (
              <AlertDialogAction
                disabled={unlock.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  unlock.mutate(undefined, {
                    onSuccess: () => {
                      setOpen(false);
                      toast.success("Nova revisão iniciada — edição desbloqueada.");
                    },
                    onError: (err: Error) => toast.error(err.message),
                  });
                }}
              >
                Criar nova revisão
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
