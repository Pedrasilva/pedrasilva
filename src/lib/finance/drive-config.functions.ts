/** Administração > Arquivo Drive: shared-drive folder settings and access test (admin only). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseDriveFolderId } from "@/lib/google-drive-folder";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const getDriveSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("finance_drive_settings").select("*").eq("id", true).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const idField = z.string().trim().max(300).optional().nullable();
export const saveDriveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    shared_drive_id: idField, intake_folder_id: idField, processed_folder_id: idField,
    failed_folder_id: idField, contabilidade_root_id: idField,
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const row: Record<string, unknown> = { id: true, updated_by: context.userId, updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(data)) row[k] = parseDriveFolderId(v ?? null);
    const { error } = await context.supabase.from("finance_drive_settings").upsert(row as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testDriveAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { getFinanceDriveConfig, testFinanceDriveAccess } = await import("./drive-config.server");
    const result = await testFinanceDriveAccess(await getFinanceDriveConfig());
    await context.supabase.from("finance_drive_settings")
      .update({ last_test: result.steps as any, last_test_ok: result.ok, last_test_at: new Date().toISOString() })
      .eq("id", true);
    return result;
  });
