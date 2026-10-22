import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { metaAdminAllowed } from "./meta-connection";

/** Authenticated RPC; the database role check runs before secret access or Meta calls. */
export const metaConnectionCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!metaAdminAllowed(admin, error)) throw new Error("Forbidden");
    const token = process.env["META_SYSTEM_USER_TOKEN"];
    if (!token) return { ok: false as const, errorCode: "secretMissing", settings: null };
    const { checkMetaConnection } = await import("./meta-connection-check.server");
    const settings = await checkMetaConnection(token);
    // Caller-scoped client preserves the admin-only RLS boundary; no service-role bypass.
    const { data: previous, error: readError } = await context.supabase.from("marketing_settings").select("connected_at").eq("id", true).maybeSingle();
    if (readError) return { ok: false as const, errorCode: "saveFailed", settings };
    settings.connected_at = previous?.connected_at ?? settings.connected_at;
    const { error: saveError } = await context.supabase.from("marketing_settings").upsert(settings);
    return { ok: !saveError && settings.connection_ok, errorCode: saveError ? "saveFailed" : settings.last_error_code, settings };
  });