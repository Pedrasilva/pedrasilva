/**
 * Manual upload into the finance intake (same storage path, ingest call and
 * duplicate warning as before). Uploads run in the background with visible
 * per-file progress: uploading (%) → reading (AI) → done | failed with reason.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Upload, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ingestFinancialDocument } from "@/lib/finance/doc-intake.functions";
import { restoreDuplicate } from "@/lib/finance/intake-inbox.functions";
import {
  startUpload, useUploadJobs, dismissUploadJob, LARGE_UPLOAD_BYTES, type UploadJob,
} from "@/lib/finance/intake-upload-store";

const BUCKET = "financial-documents";
export const OPEN_INTAKE_ITEM_EVENT = "finance:intake-open-item";

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function IntakeUploadButton() {
  const { t, i18n } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fileRef = useRef<HTMLInputElement>(null);
  const ingest = useServerFn(ingestFinancialDocument);
  const restoreDup = useServerFn(restoreDuplicate);

  /** Opens a queue item or document inside the app — never a full page reload. */
  function openTarget(queueItemId?: string, documentId?: string) {
    if (documentId) { void navigate({ to: "/finance/documents/$documentId", params: { documentId } }); return; }
    if (!queueItemId) return;
    const fire = () => window.dispatchEvent(new CustomEvent(OPEN_INTAKE_ITEM_EVENT, { detail: queueItemId }));
    if (pathname !== "/finance/entrada") void navigate({ to: "/finance/entrada" }).then(() => setTimeout(fire, 300));
    else fire();
  }

  function onFinished(job: UploadJob) {
    qc.invalidateQueries({ queryKey: ["finance", "review-queue"] });
    if (job.stage === "failed") {
      toast.error(`${job.fileName}: ${t(`finance:intakeUpload.errors.${job.error}`, { defaultValue: job.error })}`);
      return;
    }
    const res = job.result;
    toast.success(t("finance:intakeUpload.doneToast", { file: job.fileName }), {
      action: res?.queueItemId ? { label: t("finance:intakeUpload.open"), onClick: () => openTarget(res.queueItemId) } : undefined,
    });
    const dup = res ? (res.duplicate ?? res.possibleDuplicates?.[0]) : undefined;
    if (dup && res?.queueItemId) {
      const qid = res.queueItemId;
      toast.warning(
        t("finance:intakeInbox.dup.uploadWarn", { file: job.fileName, label: dup.label, date: dup.registeredAt ? new Date(dup.registeredAt).toLocaleDateString(i18n.language) : "—" }),
        {
          duration: 15000,
          action: { label: t("finance:intakeInbox.dup.open"), onClick: () => openTarget(dup.queueItemId ?? qid, dup.documentId) },
          ...(res.duplicate ? { cancel: { label: t("finance:intakeInbox.dup.keepAnyway"), onClick: () => { void restoreDup({ data: { id: qid } }).then(() => qc.invalidateQueries({ queryKey: ["finance", "review-queue"] })); } } } : {}),
        },
      );
    }
  }

  function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      startUpload(
        file,
        BUCKET,
        (path) => ingest({ data: { storagePath: path, bucket: BUCKET, originalFilename: file.name, source: "manual_upload" } }),
        onFinished,
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => handleUpload(e.target.files)} />
      <Button size="sm" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4 mr-1.5" />
        {t("finance:reviewQueue.upload")}
      </Button>
      <UploadProgressPanel onOpen={(id) => openTarget(id)} />
    </>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [active]);
  return now;
}

function UploadProgressPanel({ onOpen }: { onOpen: (queueItemId: string) => void }) {
  const { t } = useTranslation(["finance"]);
  const jobs = useUploadJobs();
  const busy = jobs.some((j) => j.stage === "uploading" || j.stage === "reading");
  const now = useNow(busy);
  if (jobs.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg p-3 space-y-2" role="status" aria-live="polite">
      <div className="text-xs font-medium">{t("finance:intakeUpload.title")}</div>
      {jobs.map((j) => {
        const secs = Math.round(((j.finishedAt ?? now) - (j.uploadedAt ?? j.startedAt)) / 1000);
        return (
          <div key={j.id} className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              {j.stage === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                : j.stage === "failed" ? <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                : <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
              <span className="truncate flex-1" title={j.fileName}>{j.fileName}</span>
              <span className="text-muted-foreground shrink-0">{mb(j.size)}</span>
              {(j.stage === "done" || j.stage === "failed") && (
                <button type="button" aria-label={t("finance:intakeUpload.dismiss") as string} onClick={() => dismissUploadJob(j.id)}><X className="h-3 w-3" /></button>
              )}
            </div>
            {j.stage === "uploading" && <Progress value={j.progress} className="h-1.5" />}
            <div className={`text-[11px] ${j.stage === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
              {j.stage === "uploading" && t("finance:intakeUpload.uploading", { progress: j.progress })}
              {j.stage === "reading" && t("finance:intakeUpload.reading", { seconds: secs })}
              {j.stage === "done" && (
                <>
                  {t("finance:intakeUpload.done", { seconds: secs })}{" "}
                  {j.result?.queueItemId && <button type="button" className="underline" onClick={() => onOpen(j.result!.queueItemId!)}>{t("finance:intakeUpload.open")}</button>}
                </>
              )}
              {j.stage === "failed" && t(`finance:intakeUpload.errors.${j.error}`, { defaultValue: t("finance:intakeUpload.failed", { reason: j.error }) })}
            </div>
            {j.stage !== "failed" && j.size > LARGE_UPLOAD_BYTES && <div className="text-[11px] text-muted-foreground">{t("finance:intakeUpload.large")}</div>}
          </div>
        );
      })}
    </div>
  );
}
