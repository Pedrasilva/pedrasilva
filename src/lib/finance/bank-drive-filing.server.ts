/**
 * Copies a filed bank document to the accountant's Drive folder
 * "Contabilidade/Banco/<conta>/<ano>/<mês>", using the same Google Drive
 * connector and archive root as the HR/backup sync. The Hub copy stays the
 * source of truth; Drive is a copy for the accountant.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseDriveFolderId } from "@/lib/google-drive-folder";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";

function headers(extra: Record<string, string> = {}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!connKey) throw new Error("Google Drive is not connected");
  return { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey, ...extra };
}

export function root(): { prefix: string; parent: string | null } {
  const rootFolder = parseDriveFolderId(process.env.GOOGLE_DRIVE_ARCHIVE_ROOT_FOLDER_ID);
  if (rootFolder) return { prefix: `rootfolder:${rootFolder}`, parent: rootFolder };
  const shared = parseDriveFolderId(process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID);
  if (shared) return { prefix: `shared:${shared}`, parent: shared };
  return { prefix: "", parent: null };
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80) || "conta";

async function ensureFolder(path: string, name: string, parentId: string | null): Promise<string> {
  const cached = await supabaseAdmin
    .from("benefit_drive_folders")
    .select("drive_folder_id")
    .eq("folder_path", path)
    .maybeSingle();
  if (cached.data?.drive_folder_id) return cached.data.drive_folder_id;
  const res = await fetch(`${GATEWAY_BASE}/drive/v3/files?fields=id,name&supportsAllDrives=true`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive folder create failed [${res.status}]: ${text.slice(0, 200)}`);
  const id = (JSON.parse(text) as { id: string }).id;
  await supabaseAdmin.from("benefit_drive_folders").upsert({ folder_path: path, drive_folder_id: id });
  return id;
}

export async function copyBankDocumentToDrive(opts: {
  bucket: string;
  storagePath: string;
  filename: string;
  accountLabel: string;
  period: string; // YYYY-MM
}): Promise<{ id: string; webViewLink: string | null }> {
  const { data: file, error } = await supabaseAdmin.storage.from(opts.bucket).download(opts.storagePath);
  if (error || !file) throw new Error(`download: ${error?.message ?? "no file"}`);
  const bytes = new Uint8Array(await file.arrayBuffer());

  const r = root();
  const [year, month] = opts.period.split("-");
  const segs = ["Contabilidade", "Banco", safe(opts.accountLabel), year, month];
  let parent = r.parent;
  let path = r.prefix;
  for (const seg of segs) {
    path = path ? `${path}/${seg}` : seg;
    parent = await ensureFolder(`bankdocs:${path}`, seg, parent);
  }

  const boundary = `lovable-${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: opts.filename, parents: [parent] })}\r\n--${boundary}\r\nContent-Type: ${file.type || "application/pdf"}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0);
  body.set(bytes, pre.length);
  body.set(post, pre.length + bytes.length);
  const res = await fetch(
    `${GATEWAY_BASE}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`,
    { method: "POST", headers: headers({ "Content-Type": `multipart/related; boundary=${boundary}` }), body },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive upload failed [${res.status}]: ${text.slice(0, 200)}`);
  const j = JSON.parse(text) as { id: string; webViewLink?: string };
  return { id: j.id, webViewLink: j.webViewLink ?? `https://drive.google.com/file/d/${j.id}/view` };
}

/** Automatic retries after a failed copy: 30 min, 2 h, 12 h; then "Tentar de novo". */
const RETRY_MINUTES = [30, 120, 720];

/**
 * Copy one filed bank document to Drive and record the result on the queue
 * row (status, file id, link, error, dates). The Hub status stays "filed".
 * `manual` = a person pressed "Tentar de novo": attempts restart.
 */
export async function copyQueueItemToDrive(id: string, opts: { manual?: boolean } = {}) {
  const { data: row, error } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("id, status, intake_type, source_bucket, source_file_url, matched_bank_account_id, bank_period, drive_file_id, drive_web_link, drive_copy_attempts")
    .eq("id", id)
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "not found" };
  if (row.drive_file_id) return { ok: true, driveFileId: row.drive_file_id, link: row.drive_web_link };
  if (row.status !== "filed" || !row.matched_bank_account_id || !row.bank_period || !row.source_file_url) {
    return { ok: false, error: "Not a filed bank document" };
  }
  const { data: acct } = await supabaseAdmin
    .from("bank_accounts").select("account_name, bank_name").eq("id", row.matched_bank_account_id).single();
  const now = new Date();
  const attempts = (opts.manual ? 0 : row.drive_copy_attempts ?? 0) + 1;
  try {
    const ext = row.source_file_url.split(".").pop() ?? "pdf";
    const kind = row.intake_type === "nota_lancamento" ? "nota-lancamento" : "extrato";
    const r = await copyBankDocumentToDrive({
      bucket: row.source_bucket ?? "financial-documents",
      storagePath: row.source_file_url,
      filename: `${row.bank_period}_${kind}_${row.id.slice(0, 8)}.${ext}`,
      accountLabel: [acct?.bank_name, acct?.account_name].filter(Boolean).join(" "),
      period: row.bank_period,
    });
    await supabaseAdmin.from("financial_document_review_queue").update({
      drive_copy_status: "copied", drive_file_id: r.id, drive_web_link: r.webViewLink, drive_copy_error: null,
      drive_copied_at: now.toISOString(), drive_copy_attempted_at: now.toISOString(),
      drive_copy_attempts: attempts, drive_next_retry_at: null,
    }).eq("id", row.id);
    return { ok: true, driveFileId: r.id, link: r.webViewLink };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
    const wait = RETRY_MINUTES[attempts - 1];
    await supabaseAdmin.from("financial_document_review_queue").update({
      drive_copy_status: "failed", drive_copy_error: msg, drive_copy_attempted_at: now.toISOString(),
      drive_copy_attempts: attempts,
      drive_next_retry_at: wait != null ? new Date(now.getTime() + wait * 60000).toISOString() : null,
    }).eq("id", row.id);
    return { ok: false, error: msg };
  }
}

/** Mark a filed bank document for copying (copied right away by the caller or the poller). */
export async function queueDriveCopy(id: string) {
  await supabaseAdmin.from("financial_document_review_queue").update({
    drive_copy_status: "pending", drive_copy_attempts: 0, drive_next_retry_at: new Date().toISOString(),
  }).eq("id", id).is("drive_file_id", null);
}

/** Poller: pending copies and failed copies whose retry time has come. */
export async function processDueDriveCopies(limit = 10) {
  const { data } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("id")
    .in("drive_copy_status", ["pending", "failed"])
    .is("drive_file_id", null)
    .not("drive_next_retry_at", "is", null)
    .lte("drive_next_retry_at", new Date().toISOString())
    .order("drive_next_retry_at")
    .limit(limit);
  let copied = 0, failed = 0;
  for (const r of data ?? []) {
    const res = await copyQueueItemToDrive(r.id);
    if (res.ok) copied++; else failed++;
  }
  return { copied, failed };
}

/** Name and link of the archive root (folder or shared drive), or the error reading it. */
export async function getArchiveRootInfo() {
  const r = root();
  const rawSet = !!(process.env.GOOGLE_DRIVE_ARCHIVE_ROOT_FOLDER_ID?.trim() || process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim());
  if (!r.parent) return { configured: rawSet, id: null, name: null, link: null, error: rawSet ? "Folder id could not be read from the setting" : null };
  const isShared = r.prefix.startsWith("shared:");
  try {
    const url = isShared
      ? `${GATEWAY_BASE}/drive/v3/drives/${r.parent}?fields=id,name`
      : `${GATEWAY_BASE}/drive/v3/files/${r.parent}?fields=id,name,webViewLink&supportsAllDrives=true`;
    const res = await fetch(url, { headers: headers() });
    const text = await res.text();
    if (!res.ok) throw new Error(`[${res.status}] ${text.slice(0, 200)}`);
    const j = JSON.parse(text) as { id: string; name: string; webViewLink?: string };
    return { configured: true, id: j.id, name: j.name, link: j.webViewLink ?? `https://drive.google.com/drive/folders/${j.id}`, error: null };
  } catch (e) {
    return { configured: true, id: r.parent, name: null, link: `https://drive.google.com/drive/folders/${r.parent}`, error: e instanceof Error ? e.message : String(e) };
  }
}
