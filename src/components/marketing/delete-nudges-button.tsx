import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteNudges } from "@/lib/marketing/nudges.functions";

/** Curators only (caller gates rendering; server re-checks). Deletes one or many questions. */
export function DeleteNudgesButton({ ids, anyAnswered, label, onDone }: { ids: string[]; anyAnswered: boolean; label?: string; onDone?: () => void }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const fn = useServerFn(deleteNudges);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await fn({ data: { ids } });
      toast.success(t("nudge.delete.done", { count: ids.length }));
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("questions.error"));
    } finally {
      setBusy(false); setOpen(false);
      qc.invalidateQueries({ queryKey: ["marketing-questions"] });
      qc.invalidateQueries({ queryKey: ["marketing-nudges"] });
      qc.invalidateQueries({ queryKey: ["marketing-briefing-requests"] });
    }
  };
  return (
    <>
      <Button size="sm" variant="outline" className="h-7" disabled={busy || ids.length === 0} onClick={() => setOpen(true)}>
        <Trash2 className="mr-1 h-3 w-3" />{label ?? t("nudge.delete.action")}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("nudge.delete.title", { count: ids.length })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("nudge.delete.body")}
              {anyAnswered && <span className="mt-2 block">{t("nudge.delete.answeredKept")}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("posts.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void run(); }}>{t("nudge.delete.action")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
