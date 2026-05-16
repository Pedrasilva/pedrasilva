import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Confirmation dialog for deleting a benefit expense.
 * Replaces the legacy native confirm() flow. Aligns visually with
 * RejectExpenseDialog: clear warning, loading state, mobile-friendly,
 * blocks double-submit while the async action runs.
 */
export function DeleteExpenseDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  loadingLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Should throw on failure so dialog stays open. */
  onConfirm: () => Promise<void>;
  title?: string;
  description?: string;
  confirmLabel?: string;
  loadingLabel?: string;
}) {
  const { t } = useTranslation(["hr"]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) setLoading(false);
  }, [open]);

  async function confirm() {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // caller already toasted
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!loading ? onOpenChange(v) : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            {title ?? t("hr:beneficios.delete.title")}
          </DialogTitle>
          <DialogDescription>
            {description ?? t("hr:beneficios.delete.descriptionGeneric")}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("hr:beneficios.delete.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={loading}>
            {loading
              ? (loadingLabel ?? t("hr:beneficios.delete.loading"))
              : (confirmLabel ?? t("hr:beneficios.delete.confirm"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
