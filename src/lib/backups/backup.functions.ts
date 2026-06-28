import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  if (!data) throw new Error("Admin role required");
}

export const runManualBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { performBackup } = await import("./backup-core.server");
    return performBackup("manual", context.userId);
  });

export const listBackupRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { listAllBackupRuns } = await import("./backup-core.server");
    return listAllBackupRuns();
  });

export const getBackupConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { BACKUP_TABLES } = await import("./backup-core.server");
    const raw = process.env.BACKUP_DRIVE_FOLDER_ID?.trim() ?? null;
    const folder = raw
      ? (raw.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1] ??
          raw.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ??
          raw.replace(/[?#].*$/, ""))
      : null;
    return {
      driveFolderId: folder,
      configured: !!folder,
      driveFolderUrl: folder ? `https://drive.google.com/drive/folders/${folder}` : null,
      driveConnector: !!process.env.GOOGLE_DRIVE_API_KEY,
      tables: BACKUP_TABLES,
    };
  });

export const cronTriggerSchema = z.object({
  trigger: z.enum(["daily", "weekly", "manual"]),
});
