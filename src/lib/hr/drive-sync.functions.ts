import { createServerFn } from "@tanstack/react-start";
import { createHash } from "crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---- Types ----------------------------------------------------------------
type PreviewItem = {
  expense_id: string;
  collaborator_name: string;
  data_despesa: string;
  ano_fiscal: number;
  categoria: string;
  valor: number;
  estado: string;
  has_receipt: boolean;
  sync_status: string | null;
  attempts: number;
  last_error: string | null;
};

export type DrivePreview = {
  totals: {
    eligible: number;
    eligible_with_receipt: number;
    already_synced: number;
    pending_upload: number;
    previous_failures: number;
    skipped_non_eligible: number;
    skipped_no_receipt: number;
  };
  to_upload: PreviewItem[];
  already_synced: PreviewItem[];
  failed_previous: PreviewItem[];
  skipped: PreviewItem[];
};

export type DriveSyncResult = {
  created: number;
  skipped: number;
  failed: number;
  failures: Array<{ expense_id: string; message: string }>;
};

// ---- Helpers --------------------------------------------------------------
const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";

function slugify(s: string): string {
  return (s || "unknown")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "unknown";
}

function sanitizeName(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "pdf") return "application/pdf";
  if (e === "png") return "image/png";
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "webp") return "image/webp";
  if (e === "heic") return "image/heic";
  return "application/octet-stream";
}

function driveHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!GOOGLE_DRIVE_API_KEY) throw new Error("GOOGLE_DRIVE_API_KEY is not configured (Google Drive connector not linked)");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
    ...extra,
  };
}

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  if (!data) throw new Error("Admin role required");
}

// Find-or-create a folder under a parent. Caches by full path.
async function ensureFolder(path: string, name: string, parentId: string | null): Promise<string> {
  // Cache lookup
  const cached = await supabaseAdmin
    .from("benefit_drive_folders")
    .select("drive_folder_id")
    .eq("folder_path", path)
    .maybeSingle();
  if (cached.data?.drive_folder_id) return cached.data.drive_folder_id;

  // Create (we use drive.file scope so we only see what we created — always create fresh under our parent)
  const body = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentId ? [parentId] : undefined,
  };
  const res = await fetch(`${GATEWAY_BASE}/drive/v3/files?fields=id,name`, {
    method: "POST",
    headers: driveHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Drive folder create failed [${res.status}]: ${text}`);
  }
  const json = JSON.parse(text) as { id: string };
  await supabaseAdmin
    .from("benefit_drive_folders")
    .upsert({ folder_path: path, drive_folder_id: json.id });
  return json.id;
}

async function ensureFolderTree(collaboratorId: string, collaboratorName: string, year: number): Promise<string> {
  const rootPath = "PSA Hub";
  const hrPath = `${rootPath}/HR Benefits`;
  const yearPath = `${hrPath}/${year}`;
  const slug = `${slugify(collaboratorName)}-${collaboratorId.slice(0, 8)}`;
  const collabPath = `${yearPath}/${slug}`;

  const root = await ensureFolder(rootPath, "PSA Hub", null);
  const hr = await ensureFolder(hrPath, "HR Benefits", root);
  const year_ = await ensureFolder(yearPath, String(year), hr);
  const col = await ensureFolder(collabPath, slug, year_);
  return col;
}

function buildFilename(opts: {
  date: string;
  category: string;
  amount: number;
  expenseId: string;
  description: string | null;
  ext: string;
}): string {
  const dateOnly = (opts.date || "").slice(0, 10);
  const cat = sanitizeName(opts.category || "outros");
  const amt = (Math.round(opts.amount * 100) / 100).toFixed(2);
  const idShort = opts.expenseId.replace(/-/g, "").slice(0, 8);
  const desc = sanitizeName((opts.description || "receipt").slice(0, 30)) || "receipt";
  return `${dateOnly}_${cat}_${amt}_${idShort}_${desc}.${opts.ext}`;
}

async function uploadMultipart(
  folderId: string,
  filename: string,
  mime: string,
  bytes: Uint8Array,
): Promise<string> {
  const boundary = `lovable-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0);
  body.set(bytes, pre.length);
  body.set(post, pre.length + bytes.length);

  const res = await fetch(
    `${GATEWAY_BASE}/upload/drive/v3/files?uploadType=multipart&fields=id,name`,
    {
      method: "POST",
      headers: driveHeaders({ "Content-Type": `multipart/related; boundary=${boundary}` }),
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Drive upload failed [${res.status}]: ${text}`);
  }
  const json = JSON.parse(text) as { id: string };
  return json.id;
}

// ---- Data fetching --------------------------------------------------------
type ExpenseRow = {
  id: string;
  collaborator_id: string;
  ano_fiscal: number;
  categoria: string;
  descricao: string | null;
  valor: number;
  data_despesa: string;
  foto_path: string | null;
  estado: string;
  collaborator_name?: string;
};

async function loadExpensesWithSync() {
  const { data: expenses, error } = await supabaseAdmin
    .from("benefit_expenses")
    .select("id, collaborator_id, ano_fiscal, categoria, descricao, valor, data_despesa, foto_path, estado");
  if (error) throw new Error(`Failed to load expenses: ${error.message}`);

  const colIds = Array.from(new Set((expenses ?? []).map((e) => e.collaborator_id)));
  const { data: cols } = await supabaseAdmin
    .from("collaborators")
    .select("id, nome")
    .in("id", colIds.length ? colIds : ["00000000-0000-0000-0000-000000000000"]);
  const colMap = new Map((cols ?? []).map((c) => [c.id, c.nome as string]));

  const { data: sync } = await supabaseAdmin
    .from("benefit_expense_drive_sync")
    .select("expense_id, status, attempts, last_error, drive_file_id");
  const syncMap = new Map((sync ?? []).map((s) => [s.expense_id, s]));

  return { expenses: (expenses ?? []) as ExpenseRow[], colMap, syncMap };
}

// ---- Server functions -----------------------------------------------------
export const previewDriveSync = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DrivePreview> => {
    await assertAdmin(context.userId);

    const { expenses, colMap, syncMap } = await loadExpensesWithSync();

    const to_upload: PreviewItem[] = [];
    const already_synced: PreviewItem[] = [];
    const failed_previous: PreviewItem[] = [];
    const skipped: PreviewItem[] = [];

    for (const e of expenses) {
      const s = syncMap.get(e.id);
      const item: PreviewItem = {
        expense_id: e.id,
        collaborator_name: colMap.get(e.collaborator_id) ?? "?",
        data_despesa: e.data_despesa,
        ano_fiscal: e.ano_fiscal,
        categoria: e.categoria,
        valor: Number(e.valor),
        estado: e.estado,
        has_receipt: !!e.foto_path,
        sync_status: s?.status ?? null,
        attempts: s?.attempts ?? 0,
        last_error: s?.last_error ?? null,
      };

      const eligible = e.estado === "aprovada" || e.estado === "paga";

      if (s?.status === "synced" && s.drive_file_id) {
        already_synced.push(item);
        continue;
      }
      if (!eligible) {
        skipped.push(item);
        continue;
      }
      if (!e.foto_path) {
        skipped.push(item);
        continue;
      }
      if (s?.status === "failed") {
        failed_previous.push(item);
      }
      to_upload.push(item);
    }

    return {
      totals: {
        eligible: expenses.filter((e) => e.estado === "aprovada" || e.estado === "paga").length,
        eligible_with_receipt: expenses.filter(
          (e) => (e.estado === "aprovada" || e.estado === "paga") && !!e.foto_path,
        ).length,
        already_synced: already_synced.length,
        pending_upload: to_upload.length,
        previous_failures: failed_previous.length,
        skipped_non_eligible: skipped.filter(
          (i) => i.estado !== "aprovada" && i.estado !== "paga",
        ).length,
        skipped_no_receipt: skipped.filter(
          (i) => (i.estado === "aprovada" || i.estado === "paga") && !i.has_receipt,
        ).length,
      },
      to_upload,
      already_synced,
      failed_previous,
      skipped,
    };
  });

export const runDriveSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }): Promise<DriveSyncResult> => {
    await assertAdmin(context.userId);
    const limit = data.limit ?? 200;

    const { expenses, colMap, syncMap } = await loadExpensesWithSync();

    const queue = expenses.filter((e) => {
      const s = syncMap.get(e.id);
      if (s?.status === "synced" && s.drive_file_id) return false;
      if (e.estado !== "aprovada" && e.estado !== "paga") return false;
      if (!e.foto_path) return false;
      return true;
    }).slice(0, limit);

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const failures: DriveSyncResult["failures"] = [];

    for (const e of queue) {
      try {
        const name = colMap.get(e.collaborator_id) ?? "unknown";

        // 1. Download receipt from storage
        const { data: blob, error: dlErr } = await supabaseAdmin.storage
          .from("benefit-receipts")
          .download(e.foto_path!);
        if (dlErr || !blob) {
          throw new Error(`Receipt download failed: ${dlErr?.message ?? "no data"}`);
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const checksum = createHash("sha256").update(bytes).digest("hex");

        // 2. Idempotency by checksum (in case foto_path changed but content identical)
        const existing = syncMap.get(e.id);
        if (existing?.source_checksum === checksum && existing.drive_file_id) {
          await supabaseAdmin
            .from("benefit_expense_drive_sync")
            .update({ status: "synced", last_error: null })
            .eq("expense_id", e.id);
          skipped++;
          continue;
        }

        // 3. Ensure folder tree
        const folderId = await ensureFolderTree(e.collaborator_id, name, e.ano_fiscal);

        // 4. Build filename
        const ext = (e.foto_path!.split(".").pop() || "bin").toLowerCase();
        const filename = buildFilename({
          date: e.data_despesa,
          category: e.categoria,
          amount: Number(e.valor),
          expenseId: e.id,
          description: e.descricao,
          ext,
        });

        // 5. Upload
        const fileId = await uploadMultipart(folderId, filename, mimeFromExt(ext), bytes);

        // 6. Record
        await supabaseAdmin
          .from("benefit_expense_drive_sync")
          .upsert({
            expense_id: e.id,
            drive_file_id: fileId,
            drive_folder_id: folderId,
            drive_file_name: filename,
            source_checksum: checksum,
            status: "synced",
            attempts: (existing?.attempts ?? 0) + 1,
            last_error: null,
            synced_at: new Date().toISOString(),
          });
        created++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ expense_id: e.id, message: msg });
        const existing = syncMap.get(e.id);
        await supabaseAdmin
          .from("benefit_expense_drive_sync")
          .upsert({
            expense_id: e.id,
            status: "failed",
            attempts: (existing?.attempts ?? 0) + 1,
            last_error: msg.slice(0, 1000),
          });
      }
    }

    return { created, skipped, failed, failures };
  });
