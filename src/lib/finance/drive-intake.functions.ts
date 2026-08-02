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
