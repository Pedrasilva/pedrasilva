import { gunzipSync } from "node:zlib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";

function driveHeaders(): Record<string, string> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!GOOGLE_DRIVE_API_KEY) throw new Error("Google Drive connector not linked");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
  };
}

type BackupPayload = {
  _meta?: {
    generated_at?: string;
    trigger?: string;
    tables?: number;
    rows?: number;
    errors?: { table: string; message: string }[];
    app?: string;
  };
  data?: Record<string, unknown[]>;
};

const cache = new Map<string, { at: number; payload: BackupPayload }>();
const TTL_MS = 5 * 60 * 1000;

async function loadBackup(runId: string): Promise<BackupPayload> {
  const cached = cache.get(runId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.payload;

  const { data: run, error } = await supabaseAdmin
    .from("backup_runs")
    .select("drive_file_id, drive_file_name, status")
    .eq("id", runId)
    .single();
  if (error || !run) throw new Error(`Backup not found: ${error?.message ?? "unknown"}`);
  if (!run.drive_file_id) throw new Error("This backup has no Drive file (it failed before upload).");

  const res = await fetch(
    `${GATEWAY_BASE}/drive/v3/files/${run.drive_file_id}?alt=media&supportsAllDrives=true`,
    { headers: driveHeaders() },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive download failed [${res.status}]: ${txt.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const json = gunzipSync(buf).toString("utf8");
  const payload = JSON.parse(json) as BackupPayload;
  cache.set(runId, { at: Date.now(), payload });
  return payload;
}

export async function inspectBackupSummary(runId: string) {
  const payload = await loadBackup(runId);
  const data = payload.data ?? {};
  const tables = Object.keys(data)
    .map((name) => ({ name, rows: Array.isArray(data[name]) ? data[name].length : 0 }))
    .sort((a, b) => b.rows - a.rows);
  const totalRows = tables.reduce((s, t) => s + t.rows, 0);
  return {
    meta: payload._meta ?? {},
    tables,
    totalRows,
    totalTables: tables.length,
  };
}

export async function previewBackupTable(runId: string, table: string, search: string) {
  const payload = await loadBackup(runId);
  const rows = (payload.data?.[table] ?? []) as Record<string, unknown>[];
  const q = search.trim().toLowerCase();
  let filtered = rows;
  if (q) {
    filtered = rows.filter((r) => {
      try {
        return JSON.stringify(r).toLowerCase().includes(q);
      } catch {
        return false;
      }
    });
  }
  const sample = filtered.slice(0, 50);
  const columns =
    rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>).slice(0, 12) : [];
  return {
    totalRows: rows.length,
    matchCount: filtered.length,
    returned: sample.length,
    columns,
    rowsJson: JSON.stringify(sample),
  };
}

export async function searchAcrossBackup(runId: string, search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return { matches: [] as { table: string; count: number }[] };
  const payload = await loadBackup(runId);
  const data = payload.data ?? {};
  const matches: { table: string; count: number }[] = [];
  for (const [table, rows] of Object.entries(data)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    let count = 0;
    for (const r of rows as Record<string, unknown>[]) {
      try {
        if (JSON.stringify(r).toLowerCase().includes(q)) count++;
      } catch {
        /* ignore */
      }
    }
    if (count > 0) matches.push({ table, count });
  }
  matches.sort((a, b) => b.count - a.count);
  return { matches };
}
