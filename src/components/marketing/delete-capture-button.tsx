import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { DeleteExpenseDialog } from "@/components/hr/DeleteExpenseDialog";
import { deleteCapture } from "@/lib/marketing/captures.functions";

/** Destructive delete inside the capture drawer; visible only to those allowed to delete. */
export function DeleteCaptureButton({ capture, canCurate, onDeleted }: {
  capture: { id: string; created_by: string | null; status: string };
  canCurate: boolean;
  onDeleted: () => void;
}) {
  const { t } = useTranslation("marketing");
  const { user } = useAuth();
  const qc = useQueryClient();
  const run = useServerFn(deleteCapture);
  const [open, setOpen] = useState(false);
  const own = !!user && capture.created_by === user.id && (capture.status === "new" || capture.status === "enriched");
  if (!canCurate && !own) return null;

  const confirm = async () => {
    const r = await run({ data: { captureId: capture.id } });
    if (!r.ok) {
      const msg = r.reason === "published" ? t("delete.published")
        : r.reason === "drafts" ? t("delete.drafts", { count: r.count ?? 0 })
        : r.reason === "forbidden" ? t("delete.forbidden") : t("delete.error");
      toast.error(msg);
      throw new Error(r.reason);
    }
    toast.success(t("delete.done"));
    qc.invalidateQueries({ queryKey: ["marketing-captures"] });
    onDeleted();
  };

  return (
    <div className="mt-6 border-t pt-4">
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="mr-1 h-4 w-4" />{t("delete.button")}
      </Button>
      <DeleteExpenseDialog open={open} onOpenChange={setOpen} onConfirm={confirm}
        title={t("delete.title")} description={t("delete.confirm")}
        confirmLabel={t("delete.button")} loadingLabel={t("delete.deleting")} />
    </div>
  );
}
