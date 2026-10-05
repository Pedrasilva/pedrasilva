/**
 * Manual upload into the finance intake (moved from the retired review queue
 * screen; same storage path, ingest call and duplicate warning).
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ingestFinancialDocument } from "@/lib/finance/doc-intake.functions";
import { restoreDuplicate } from "@/lib/finance/intake-inbox.functions";

const BUCKET = "financial-documents";

export function IntakeUploadButton() {
  const { t, i18n } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const ingest = useServerFn(ingestFinancialDocument);
  const restoreDup = useServerFn(restoreDuplicate);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `intake/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
        if (upErr) throw new Error(upErr.message);
        const res = await ingest({ data: { storagePath: path, bucket: BUCKET, originalFilename: file.name, source: "manual_upload" } });
        if (!res.ok) toast.error(`${file.name}: ${res.error ?? "extraction failed"}`);
        const dup = res.ok ? (res.duplicate ?? res.possibleDuplicates?.[0]) : undefined;
        if (dup && res.queueItemId) {
          const qid = res.queueItemId;
          toast.warning(
            t("finance:intakeInbox.dup.uploadWarn", { file: file.name, label: dup.label, date: dup.registeredAt ? new Date(dup.registeredAt).toLocaleDateString(i18n.language) : "—" }),
            {
              duration: 15000,
              action: { label: t("finance:intakeInbox.dup.open"), onClick: () => { window.location.href = dup.documentId ? `/finance/documents/${dup.documentId}` : "/finance/entrada"; } },
              ...(res.duplicate ? { cancel: { label: t("finance:intakeInbox.dup.keepAnyway"), onClick: () => { void restoreDup({ data: { id: qid } }).then(() => qc.invalidateQueries({ queryKey: ["finance", "review-queue"] })); } } } : {}),
            },
          );
        }
      }
      toast.success(t("finance:reviewQueue.uploadDone"));
      qc.invalidateQueries({ queryKey: ["finance", "review-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => handleUpload(e.target.files)} />
      <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
        {t("finance:reviewQueue.upload")}
      </Button>
    </>
  );
}
