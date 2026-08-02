/**
 * Drive folder intake — third door into the SAME D3 review-queue pipeline.
 *
 * A shared Drive folder ("Finance Intake") is polled on the same cadence as
 * the Gmail poller. Every new document file is downloaded, stored in the
 * existing `financial-documents` bucket and pushed through
 * `ingestStoredDocument` with `source = 'drive_folder'`. Nothing is
 * auto-filed: everything lands in `financial_document_review_queue` as
 * pending_review, exactly like email/manual upload.
 *
 * After queuing, the source file is MOVED to `Finance Intake/Processed`
 * (or `Finance Intake/Failed` when it could not be handled) so whoever
 * dropped it gets a clear visual signal and nothing is retried forever.
 *
 * Reuses the Google Drive connector already used by the HR/backup sync
 * (LOVABLE_API_KEY + GOOGLE_DRIVE_API_KEY through the connector gateway).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestStoredDocument } from "@/lib/finance/doc-intake.server";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";
const BUCKET = "financial-documents";
const MAX_FILES = 25;

/** Formats the AI extraction step can read directly (vision-capable model). */
const SUPPORTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

function driveHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!connKey) throw new Error("GOOGLE_DRIVE_API_KEY is not configured (Drive connector not linked)");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
    ...extra,
  };
}

async function drive(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    ...init,
    headers: driveHeaders((init.headers as Record<string, string>) ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive gateway ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Path→id cache shared with the HR Drive sync (generic folder cache). */
async function ensureFolder(path: string, name: string, parentId: string | null): Promise<string> {
  const cached = await supabaseAdmin
    .from("benefit_drive_folders")
    .select("drive_folder_id")
    .eq("folder_path", path)
    .maybeSingle();
  if (cached.data?.drive_folder_id) return cached.data.drive_folder_id;

  const json = (await drive(`/drive/v3/files?fields=id,name&supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  })) as { id: string };

  await supabaseAdmin
    .from("benefit_drive_folders")
    .upsert({ folder_path: path, drive_folder_id: json.id });
  return json.id;
}

export type IntakeFolders = { inbox: string; processed: string; failed: string };

/**
 * Resolve the intake folder tree.
 *  - GOOGLE_DRIVE_FINANCE_INTAKE_FOLDER_ID: use that folder as the inbox
 *    (share it with whoever needs to drop scans in).
 *  - otherwise create "Finance Intake" under the configured archive root
 *    (or My Drive) and reuse it from then on.
 */
export async function ensureIntakeFolders(): Promise<IntakeFolders> {
  const configured = process.env.GOOGLE_DRIVE_FINANCE_INTAKE_FOLDER_ID?.trim();
  const archiveRoot = process.env.GOOGLE_DRIVE_ARCHIVE_ROOT_FOLDER_ID?.trim() || null;

  let inbox: string;
  let base: string;
  if (configured) {
    inbox = configured;
    base = `intakefolder:${configured}`;
  } else {
    base = archiveRoot ? `rootfolder:${archiveRoot}/Finance Intake` : "PSA Hub/Finance Intake";
    inbox = await ensureFolder(base, "Finance Intake", archiveRoot);
  }

  const processed = await ensureFolder(`${base}/Processed`, "Processed", inbox);
  const failed = await ensureFolder(`${base}/Failed`, "Failed", inbox);
  return { inbox, processed, failed };
}

type DriveFile = { id: string; name: string; mimeType: string; size?: string };

async function listInbox(folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const json = (await drive(
    `/drive/v3/files?q=${q}&pageSize=${MAX_FILES}&orderBy=createdTime` +
      `&fields=files(id,name,mimeType,size)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  )) as { files?: DriveFile[] };
  return (json.files ?? []).filter((f) => f.mimeType !== "application/vnd.google-apps.folder");
}

async function downloadFile(fileId: string): Promise<Uint8Array> {
  const res = await fetch(
    `${GATEWAY_BASE}/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: driveHeaders() },
  );
  if (!res.ok) {
    throw new Error(`Drive download ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function moveFile(fileId: string, from: string, to: string) {
  await drive(
    `/drive/v3/files/${fileId}?addParents=${to}&removeParents=${from}` +
      `&supportsAllDrives=true&fields=id,parents`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
}

function resolveMime(file: DriveFile): string {
  if (file.mimeType && file.mimeType !== "application/octet-stream") return file.mimeType;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? file.mimeType ?? "application/octet-stream";
}

export type DriveIntakeSummary = {
  scanned: number;
  queued: number;
  skipped: number;
  failed: number;
  errors: string[];
  inboxFolderId?: string;
};

export async function runDriveFolderIntake(): Promise<DriveIntakeSummary> {
  const summary: DriveIntakeSummary = { scanned: 0, queued: 0, skipped: 0, failed: 0, errors: [] };

  const folders = await ensureIntakeFolders();
  summary.inboxFolderId = folders.inbox;

  const files = await listInbox(folders.inbox);
  if (files.length === 0) return summary;

  const { data: seen } = await supabaseAdmin
    .from("financial_drive_processed_files")
    .select("drive_file_id")
    .in("drive_file_id", files.map((f) => f.id));
  const seenSet = new Set((seen ?? []).map((r) => r.drive_file_id));

  for (const file of files) {
    if (seenSet.has(file.id)) continue;
    summary.scanned++;
    const mime = resolveMime(file);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    const log = async (values: Record<string, unknown>) => {
      await supabaseAdmin.from("financial_drive_processed_files").upsert(
        {
          drive_file_id: file.id,
          file_name: file.name,
          mime_type: mime,
          size_bytes: file.size ? Number(file.size) : null,
          ...values,
        },
        { onConflict: "drive_file_id" },
      );
    };

    try {
      // Non-document files are never silently dropped: they are logged and
      // moved to Failed so the inbox stays clean.
      if (!SUPPORTED_MIME.has(mime)) {
        await moveFile(file.id, folders.inbox, folders.failed);
        await log({
          status: "skipped",
          reason:
            mime === "image/tiff"
              ? "unsupported_format_tiff (save the scan as PDF, JPEG or PNG)"
              : `unsupported_format:${mime}`,
          moved_to: "Failed",
        });
        summary.skipped++;
        continue;
      }

      const bytes = await downloadFile(file.id);
      const storagePath = `intake/drive/${file.id}-${safe}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(storagePath, bytes, { contentType: mime, upsert: true });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      const res = await ingestStoredDocument({
        bucket: BUCKET,
        storagePath,
        originalFilename: file.name,
        source: "drive_folder",
      });

      if (res.queueItemId && res.ok) {
        await moveFile(file.id, folders.inbox, folders.processed);
        await log({
          status: "queued",
          queue_item_id: res.queueItemId,
          storage_path: storagePath,
          moved_to: "Processed",
        });
        summary.queued++;
      } else {
        // Extraction failed — a queue row may still exist with the error.
        await moveFile(file.id, folders.inbox, folders.failed);
        await log({
          status: "failed",
          queue_item_id: res.queueItemId ?? null,
          storage_path: storagePath,
          moved_to: "Failed",
          error: (res.error ?? "extraction failed").slice(0, 1000),
        });
        summary.failed++;
        summary.errors.push(`${file.name}: ${res.error ?? "extraction failed"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.failed++;
      summary.errors.push(`${file.name}: ${msg}`);
      try {
        await moveFile(file.id, folders.inbox, folders.failed);
      } catch {
        /* leave in place if the move itself fails; the log row prevents retries */
      }
      await log({ status: "failed", error: msg.slice(0, 1000), moved_to: "Failed" });
    }
  }

  return summary;
}
