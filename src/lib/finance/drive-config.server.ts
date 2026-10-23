/**
 * Finance Drive configuration (shared drive "PSA Finance"). Folder IDs come from
 * finance_drive_settings (Administração > Arquivo Drive), falling back to the
 * old env vars. Every Drive call goes through driveUrl(), which always adds
 * supportsAllDrives and, for listings, includeItemsFromAllDrives + driveId.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseDriveFolderId } from "@/lib/google-drive-folder";

export const DRIVE_GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

export type FinanceDriveConfig = {
  sharedDriveId: string | null;
  intake: string | null;
  processed: string | null;
  failed: string | null;
  contabilidade: string | null;
};

export async function getFinanceDriveConfig(): Promise<FinanceDriveConfig> {
  const { data } = await supabaseAdmin.from("finance_drive_settings").select("*").eq("id", true).maybeSingle();
  return {
    sharedDriveId: parseDriveFolderId(data?.shared_drive_id) ?? parseDriveFolderId(process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID),
    intake: parseDriveFolderId(data?.intake_folder_id) ?? parseDriveFolderId(process.env.GOOGLE_DRIVE_FINANCE_INTAKE_FOLDER_ID),
    processed: parseDriveFolderId(data?.processed_folder_id),
    failed: parseDriveFolderId(data?.failed_folder_id),
    contabilidade: parseDriveFolderId(data?.contabilidade_root_id),
  };
}

export function driveHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!connKey) throw new Error("Google Drive is not connected");
  return { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey, ...extra };
}

/** Builds a gateway URL with shared-drive flags. `list` adds corpora/driveId. */
export function driveUrl(path: string, params: Record<string, string> = {}, opts: { list?: boolean; driveId?: string | null } = {}) {
  const u = new URL(`${DRIVE_GATEWAY}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("supportsAllDrives", "true");
  if (opts.list) {
    u.searchParams.set("includeItemsFromAllDrives", "true");
    if (opts.driveId) {
      u.searchParams.set("corpora", "drive");
      u.searchParams.set("driveId", opts.driveId);
    }
  }
  return u.toString();
}

export async function driveJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: driveHeaders((init.headers as Record<string, string>) ?? {}) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

export type AccessStep = { step: string; ok: boolean; ms: number; detail: string };

/**
 * Lists the intake folder, creates a small test file there, moves it to
 * Processed and deletes it. Stops at the first failing step; always tries to
 * delete the test file if it was created.
 */
export async function testFinanceDriveAccess(cfg: FinanceDriveConfig): Promise<{ ok: boolean; steps: AccessStep[] }> {
  const steps: AccessStep[] = [];
  const run = async <T,>(step: string, fn: () => Promise<{ v: T; detail: string }>): Promise<T | null> => {
    const t0 = Date.now();
    try {
      const { v, detail } = await fn();
      steps.push({ step, ok: true, ms: Date.now() - t0, detail });
      return v;
    } catch (e) {
      steps.push({ step, ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message : String(e) });
      return null;
    }
  };
  // My Drive is allowed for now (no shared drive yet); shared-drive checks apply only when set.
  const missing = (["intake", "processed", "failed", "contabilidade"] as const).filter((k) => !cfg[k]);
  if (missing.length) {
    steps.push({ step: "config", ok: false, ms: 0, detail: `missing: ${missing.join(", ")}` });
    return { ok: false, steps };
  }
  const drv = !cfg.sharedDriveId ? true : await run("drive", async () => {
    const d = await driveJson(driveUrl(`/drive/v3/drives/${cfg.sharedDriveId}`, { fields: "id,name" }));
    return { v: d, detail: d.name };
  });
  if (!drv) return { ok: false, steps };
  for (const [label, id] of [["intake", cfg.intake], ["processed", cfg.processed], ["failed", cfg.failed], ["contabilidade", cfg.contabilidade]] as const) {
    const f = await run(`folder:${label}`, async () => {
      const m = await driveJson(driveUrl(`/drive/v3/files/${id}`, { fields: "id,name,driveId,capabilities(canAddChildren,canMoveChildrenWithinDrive,canDeleteChildren,canTrashChildren)" }));
      const c = m.capabilities ?? {};
      if (cfg.sharedDriveId) {
        if (m.driveId !== cfg.sharedDriveId) throw new Error(`"${m.name}" is not in the shared drive`);
        if (!c.canAddChildren || !c.canMoveChildrenWithinDrive) throw new Error(`"${m.name}": role too low (needs Content manager)`);
      } else if (!c.canAddChildren) throw new Error(`"${m.name}": no permission to add files`);
      return { v: m, detail: m.name };
    });
    if (!f) return { ok: false, steps };
  }
  const listed = await run("list", async () => {
    const r = await driveJson(driveUrl("/drive/v3/files", { q: `'${cfg.intake}' in parents and trashed = false`, pageSize: "100", fields: "files(id)" }, { list: true, driveId: cfg.sharedDriveId }));
    return { v: r, detail: `${(r.files ?? []).length} files` };
  });
  if (!listed) return { ok: false, steps };
  const name = `_psa-hub-access-test-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  const created = await run("create", async () => {
    const boundary = "psahub" + Math.random().toString(36).slice(2);
    const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name, parents: [cfg.intake] })}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\nPSA Hub access test. Safe to delete.\r\n--${boundary}--`;
    const r = await driveJson(driveUrl("/upload/drive/v3/files", { uploadType: "multipart", fields: "id,name" }), {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
    });
    return { v: r.id as string, detail: name };
  });
  if (!created) return { ok: false, steps };
  const moved = await run("move", async () => {
    await driveJson(driveUrl(`/drive/v3/files/${created}`, { addParents: cfg.processed!, removeParents: cfg.intake!, fields: "id,parents" }), {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    return { v: true, detail: "Finance Intake → Processed" };
  });
  const deleted = await run("delete", async () => {
    const res = await fetch(driveUrl(`/drive/v3/files/${created}`), { method: "DELETE", headers: driveHeaders() });
    if (!res.ok && res.status !== 204) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { v: true, detail: name };
  });
  return { ok: !!moved && !!deleted, steps };
}
