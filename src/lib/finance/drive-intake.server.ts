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
import { parseDriveFolderId } from "@/lib/google-drive-folder";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestStoredDocument } from "@/lib/finance/doc-intake.server";
import { PSA_ENTITY_ID } from "@/lib/finance/entity";
import { driveUrl, getFinanceDriveConfig } from "@/lib/finance/drive-config.server";

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

const folderId = parseDriveFolderId;

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
export async function ensureIntakeFolders(): Promise<IntakeFolders & { driveId?: string | null }> {
  // Shared drive "PSA Finance": folder IDs set in Administração > Arquivo Drive win.
  const cfg = await getFinanceDriveConfig();
  if (cfg.intake && cfg.processed && cfg.failed) {
    return { inbox: cfg.intake, processed: cfg.processed, failed: cfg.failed, driveId: cfg.sharedDriveId };
  }
  const configured = folderId(process.env.GOOGLE_DRIVE_FINANCE_INTAKE_FOLDER_ID);
  const archiveRoot = folderId(process.env.GOOGLE_DRIVE_ARCHIVE_ROOT_FOLDER_ID);

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

async function listInbox(folderId: string, driveId?: string | null): Promise<DriveFile[]> {
  const url = driveUrl("/drive/v3/files", {
    q: `'${folderId}' in parents and trashed = false`, pageSize: String(MAX_FILES), orderBy: "createdTime",
    fields: "files(id,name,mimeType,size)",
  }, { list: true, driveId });
  const json = (await drive(url.slice(GATEWAY_BASE.length))) as { files?: DriveFile[] };
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

/** Moves (and optionally renames / describes) a file; returns its Drive link. */
async function moveFile(fileId: string, from: string, to: string, meta: { name?: string; description?: string } = {}) {
  const j = (await drive(
    `/drive/v3/files/${fileId}?addParents=${to}&removeParents=${from}` +
      `&supportsAllDrives=true&fields=id,parents,webViewLink`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) },
  )) as { id: string; webViewLink?: string };
  return j.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
}

/** Entrada reference shown in the Hub and used in Processed names. */
export const entradaRef = (queueItemId: string) => `E-${queueItemId.slice(0, 8).toUpperCase()}`;

const lisbonDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(d);

export function processedName(queueItemId: string, original: string, date = new Date()) {
  const clean = original.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `${lisbonDate(date)}_${entradaRef(queueItemId)}_${clean}`.slice(0, 200);
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

export async function runDriveFolderIntake(opts: { maxFiles?: number } = {}): Promise<DriveIntakeSummary> {
  const summary: DriveIntakeSummary = { scanned: 0, queued: 0, skipped: 0, failed: 0, errors: [] };

  const folders = await ensureIntakeFolders();
  summary.inboxFolderId = folders.inbox;

  // Pickup is ONLY from the intake folder ("Entrada"), never from its parent.
  const files = (await listInbox(folders.inbox, folders.driveId)).slice(0, opts.maxFiles ?? MAX_FILES);
  if (files.length === 0) {
    await trashOldProcessed(folders.processed, folders.driveId);
    return summary;
  }

  // A file still in Entrada with a final log row (queued/skipped) is skipped; earlier
  // failures (e.g. the move was refused) are retried, reusing the queue item already created.
  const { data: seen } = await supabaseAdmin
    .from("financial_drive_processed_files")
    .select("drive_file_id, status, queue_item_id")
    .in("drive_file_id", files.map((f) => f.id));
  const seenMap = new Map((seen ?? []).map((r) => [r.drive_file_id, r]));

  for (const file of files) {
    const prev = seenMap.get(file.id);
    if (prev && prev.status !== "failed") {
      // Logged as done but still in Entrada (an older run could not move it): move it now.
      if (prev.queue_item_id) {
        try {
          const name = processedName(prev.queue_item_id, file.name);
          const link = await moveFile(file.id, folders.inbox, folders.processed, { name });
          await supabaseAdmin.from("financial_drive_processed_files").update({ moved_to: "Processed", processed_name: name, drive_link: link }).eq("drive_file_id", file.id);
          await supabaseAdmin.from("financial_document_review_queue").update({ drive_intake_link: link }).eq("id", prev.queue_item_id);
        } catch (e) { summary.errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      continue;
    }
    summary.scanned++;
    const mime = resolveMime(file);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `intake/drive/${file.id}-${safe}`;

    const log = async (values: Record<string, unknown>) => {
      await supabaseAdmin.from("financial_drive_processed_files").upsert(
        {
          entity_id: PSA_ENTITY_ID,
          drive_file_id: file.id,
          file_name: file.name,
          mime_type: mime,
          size_bytes: file.size ? Number(file.size) : null,
          processed_at: new Date().toISOString(),
          ...values,
        },
        { onConflict: "drive_file_id" },
      );
    };
    const toFailed = async (reason: string, extra: Record<string, unknown> = {}) => {
      let link: string | null = null;
      try {
        link = await moveFile(file.id, folders.inbox, folders.failed, { description: `PSA Hub: ${reason}`.slice(0, 1000) });
      } catch (e) {
        summary.errors.push(`${file.name}: move to Failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      await log({ status: "failed", error: reason.slice(0, 1000), moved_to: link ? "Failed" : null, drive_link: link, ...extra });
    };

    try {
      if (!SUPPORTED_MIME.has(mime)) {
        const reason = mime === "image/tiff"
          ? "unsupported_format_tiff (save the scan as PDF, JPEG or PNG)"
          : `unsupported_format:${mime}`;
        const link = await moveFile(file.id, folders.inbox, folders.failed, { description: `PSA Hub: ${reason}` });
        await log({ status: "skipped", reason, moved_to: "Failed", drive_link: link });
        summary.skipped++;
        continue;
      }

      // Reuse a queue item created by an earlier run whose move failed.
      let queueItemId: string | null = prev?.queue_item_id ?? null;
      let ok = true;
      let error: string | undefined;
      let dupLabel: string | null = null;
      if (!queueItemId) {
        const { data: existing } = await supabaseAdmin.from("financial_document_review_queue")
          .select("id, duplicate_of_id, duplicate_of_document_id").eq("source_file_url", storagePath).is("removed_at", null).limit(1).maybeSingle();
        if (existing) {
          queueItemId = existing.id;
          if (existing.duplicate_of_id) dupLabel = entradaRef(existing.duplicate_of_id);
          else if (existing.duplicate_of_document_id) dupLabel = existing.duplicate_of_document_id.slice(0, 8).toUpperCase();
        }
      }
      if (!queueItemId) {
        const bytes = await downloadFile(file.id);
        const { error: upErr } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(storagePath, bytes, { contentType: mime, upsert: true });
        if (upErr) throw new Error(`upload: ${upErr.message}`);
        const res = await ingestStoredDocument({ bucket: BUCKET, storagePath, originalFilename: file.name, source: "drive_folder" });
        queueItemId = res.queueItemId ?? null;
        ok = res.ok;
        error = res.error;
        if (res.duplicate) {
          dupLabel = res.duplicate.queueItemId ? entradaRef(res.duplicate.queueItemId) : (res.duplicate.label || res.duplicate.documentId?.slice(0, 8) || "?");
        }
      }

      if (queueItemId && ok) {
        const name = processedName(queueItemId, file.name);
        const link = await moveFile(file.id, folders.inbox, folders.processed, {
          name,
          ...(dupLabel ? { description: `DUPLICADO de ${dupLabel}` } : {}),
        });
        await supabaseAdmin.from("financial_document_review_queue").update({ drive_intake_link: link }).eq("id", queueItemId);
        await log({
          status: "queued", queue_item_id: queueItemId, storage_path: storagePath, moved_to: "Processed",
          processed_name: name, drive_link: link, error: null, reason: dupLabel ? `DUPLICADO de ${dupLabel}` : null,
        });
        summary.queued++;
      } else {
        const reason = error ?? "extraction failed";
        await toFailed(reason, { queue_item_id: queueItemId, storage_path: storagePath });
        summary.failed++;
        summary.errors.push(`${file.name}: ${reason}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.failed++;
      summary.errors.push(`${file.name}: ${msg}`);
      await toFailed(msg);
    }
  }

  await trashOldProcessed(folders.processed, folders.driveId);
  return summary;
}

/** Files in Processed older than 90 days go to Drive trash (never permanently deleted). */
async function trashOldProcessed(processed: string, driveId?: string | null) {
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  try {
    const url = driveUrl("/drive/v3/files", {
      q: `'${processed}' in parents and trashed = false and modifiedTime < '${cutoff}'`, pageSize: "50", fields: "files(id)",
    }, { list: true, driveId });
    const j = (await drive(url.slice(GATEWAY_BASE.length))) as { files?: { id: string }[] };
    for (const f of j.files ?? []) {
      await drive(`/drive/v3/files/${f.id}?supportsAllDrives=true&fields=id`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
      });
      await supabaseAdmin.from("financial_drive_processed_files").update({ trashed_at: new Date().toISOString() }).eq("drive_file_id", f.id);
    }
  } catch { /* retention is best-effort; pickup results stand */ }
}
