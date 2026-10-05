/**
 * Copies a filed bank document to the accountant's Drive folder
 * "Contabilidade/Banco/<conta>/<ano>/<mês>", using the same Google Drive
 * connector and archive root as the HR/backup sync. The Hub copy stays the
 * source of truth; Drive is a copy for the accountant.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";

function headers(extra: Record<string, string> = {}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!connKey) throw new Error("Google Drive is not connected");
  return { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey, ...extra };
}

function root(): { prefix: string; parent: string | null } {
  const rootFolder = process.env.GOOGLE_DRIVE_ARCHIVE_ROOT_FOLDER_ID?.trim();
  if (rootFolder) return { prefix: `rootfolder:${rootFolder}`, parent: rootFolder };
  const shared = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim();
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
}): Promise<string> {
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
    `${GATEWAY_BASE}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id`,
    { method: "POST", headers: headers({ "Content-Type": `multipart/related; boundary=${boundary}` }), body },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive upload failed [${res.status}]: ${text.slice(0, 200)}`);
  return (JSON.parse(text) as { id: string }).id;
}
