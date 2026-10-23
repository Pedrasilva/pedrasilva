import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DriveIntakeFolderInfo = {
  ok: boolean;
  inboxFolderId?: string;
  error?: string;
};

/** Returns (creating if needed) the shared "Finance Intake" Drive folder. */
export const getDriveIntakeFolder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DriveIntakeFolderInfo> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false, error: "Admin role required" };

    try {
      const { ensureIntakeFolders } = await import("@/lib/finance/drive-intake.server");
      const folders = await ensureIntakeFolders();
      return { ok: true, inboxFolderId: folders.inbox };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

/** "Buscar agora": runs the Drive pickup immediately (admin or finance). */
export const fetchDriveIntakeNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: isAdmin }, { data: hasFinance }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_permission", { _user_id: context.userId, _key: "finance.dashboard" }),
    ]);
    if (!isAdmin && !hasFinance) throw new Response("Forbidden", { status: 403 });
    const { runDriveFolderIntake } = await import("@/lib/finance/drive-intake.server");
    const s = await runDriveFolderIntake({ maxFiles: 15 });
    return { scanned: s.scanned, queued: s.queued, skipped: s.skipped, failed: s.failed, errors: s.errors.slice(0, 5) };
  });
