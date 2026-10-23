import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HardDriveDownload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchDriveIntakeNow } from "@/lib/finance/drive-intake.functions";

/** "Buscar agora": picks up files dropped in Drive › Finance Intake › Entrada right away. */
export function DriveFetchNowButton() {
  const { t } = useTranslation("finance");
  const qc = useQueryClient();
  const run = useServerFn(fetchDriveIntakeNow);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await run();
      const msg = t("finance:driveFetch.done", { queued: r.queued, failed: r.failed + r.skipped });
      (r.failed ? toast.error : toast.success)(r.errors.length ? `${msg} ${r.errors[0]}` : msg);
      await qc.invalidateQueries({ queryKey: ["finance"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void go()}>
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <HardDriveDownload className="mr-1.5 h-4 w-4" />}
      {t("finance:driveFetch.label")}
    </Button>
  );
}
