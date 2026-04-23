import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCollaboratorReferenceCounts } from "@/lib/hr/use-collaborators";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborator: { id: string; nome: string } | null;
  pending: boolean;
  onConfirm: (reason: string) => void;
};

export function ArchiveCollaboratorDialog({
  open,
  onOpenChange,
  collaborator,
  pending,
  onConfirm,
}: Props) {
  const { t } = useTranslation(["hr", "common"]);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const refs = useCollaboratorReferenceCounts(collaborator?.id ?? "", open);
  const counts = refs.data;
  const hasRefs =
    !!counts &&
    (counts.snapshots > 0 || counts.vacations > 0 || counts.benefitExpenses > 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("hr:colaboradores.archiveDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {collaborator
              ? t("hr:colaboradores.archiveDialog.description", {
                  name: collaborator.nome,
                })
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasRefs && counts && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="mb-1.5 font-medium text-foreground">
              {t("hr:colaboradores.archiveDialog.referencesNote")}
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

        <div className="space-y-1.5">
          <Label htmlFor="archive-reason" className="text-xs">
            {t("hr:colaboradores.archiveDialog.reasonLabel")}
          </Label>
          <Textarea
            id="archive-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("hr:colaboradores.archiveDialog.reasonPlaceholder")}
            rows={2}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("common:cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm(reason);
            }}
          >
            {pending
              ? t("hr:colaboradores.archiveDialog.archiving")
              : t("hr:colaboradores.archiveDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
