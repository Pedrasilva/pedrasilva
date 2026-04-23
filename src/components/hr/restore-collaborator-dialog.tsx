import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/i18n/use-date-locale";
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
import { useCollaboratorReferenceCounts } from "@/lib/hr/use-collaborators";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborator:
    | {
        id: string;
        nome: string;
        archived_at: string | null;
        archive_reason: string | null;
      }
    | null;
  pending: boolean;
  onConfirm: () => void;
};

export function RestoreCollaboratorDialog({
  open,
  onOpenChange,
  collaborator,
  pending,
  onConfirm,
}: Props) {
  const { t } = useTranslation(["hr", "common"]);
  const locale = useDateLocale();
  const refs = useCollaboratorReferenceCounts(collaborator?.id ?? "", open);
  const counts = refs.data;
  const hasRefs =
    !!counts &&
    (counts.snapshots > 0 || counts.vacations > 0 || counts.benefitExpenses > 0);

  const archivedOn = collaborator?.archived_at
    ? format(parseISO(collaborator.archived_at), "PPP", { locale })
    : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("hr:colaboradores.restoreDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {collaborator
              ? t("hr:colaboradores.restoreDialog.description", {
                  name: collaborator.nome,
                })
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {(archivedOn || collaborator?.archive_reason) && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            {archivedOn && (
              <div>
                <span className="font-medium text-foreground">
                  {t("hr:colaboradores.restoreDialog.archivedOn")}
                </span>{" "}
                {archivedOn}
              </div>
            )}
            {collaborator?.archive_reason && (
              <div>
                <span className="font-medium text-foreground">
                  {t("hr:colaboradores.restoreDialog.archiveReason")}
                </span>{" "}
                <span className="italic">{collaborator.archive_reason}</span>
              </div>
            )}
          </div>
        )}

        {hasRefs && counts && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="mb-1.5 font-medium text-foreground">
              {t("hr:colaboradores.restoreDialog.referencesNote")}
            </div>
            <ul className="space-y-0.5">
              <li>
                {t("hr:colaboradores.archiveDialog.refs.snapshots", {
                  count: counts.snapshots,
                })}
              </li>
              <li>
                {t("hr:colaboradores.archiveDialog.refs.vacations", {
                  count: counts.vacations,
                })}
              </li>
              <li>
                {t("hr:colaboradores.archiveDialog.refs.benefitExpenses", {
                  count: counts.benefitExpenses,
                })}
              </li>
            </ul>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("common:cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {pending
              ? t("hr:colaboradores.restoreDialog.restoring")
              : t("hr:colaboradores.restoreDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
