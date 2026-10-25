import i18n from "@/i18n/index";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { allocationLoggedHours } from "@/lib/projects/use-planner";
import { removalMode } from "@/lib/projects/allocation-removal";

/** Project Gantt removal: delete when no hours are logged, otherwise only retire (hours preserved). */
export function AllocationRemoveDialog({ open, onOpenChange, allocationId, name, onRemove }: {
  open: boolean; onOpenChange: (v: boolean) => void; allocationId: string; name: string;
  onRemove: (mode: "delete" | "retire") => Promise<unknown>;
}) {
  const { t } = useTranslation("projects");
  const [hours, setHours] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return; setHours(null); setFailed(false);
    allocationLoggedHours(allocationId).then(setHours, () => setFailed(true));
  }, [open, allocationId]);
  const mode = failed ? "retire" : hours === null ? null : removalMode(hours);
  const shown = (hours ?? 0).toLocaleString(i18n.language, { maximumFractionDigits: 2 });
  return <AlertDialog open={open} onOpenChange={onOpenChange}><AlertDialogContent onPointerDown={e => e.stopPropagation()}>
    <AlertDialogHeader>
      <AlertDialogTitle>{mode === "delete" ? t("historySafety.delete") : t("historySafety.retire")}</AlertDialogTitle>
      <AlertDialogDescription>{mode === null ? t("historySafety.checking") : mode === "delete" ? t("historySafety.deleteConfirm", { name }) : <>{t("historySafety.retireConfirm", { name })} {!failed && t("historySafety.retireBecause", { hours: shown })}</>}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter><AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
      <AlertDialogAction disabled={mode === null} className={mode === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={async () => {
        if (!mode) return;
        try { await onRemove(mode); toast.success(mode === "delete" ? t("historySafety.deleted") : t("historySafety.retired")); }
        catch (e) { toast.error(mode === "delete" ? t("historySafety.blocked") : (e as Error).message); }
      }}>{mode === "delete" ? t("historySafety.delete") : t("historySafety.retire")}</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
