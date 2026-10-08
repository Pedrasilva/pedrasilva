import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Curators and the project's team: AI story suggestions + captions for a saved press kit. */
export const processPressKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kitId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: kit } = await sb.from("marketing_project_press_kits").select("id, profile_id").eq("id", data.kitId).maybeSingle();
    if (!kit) throw new Error("Press kit not found");
    const { data: ok } = await sb.rpc("marketing_can_brief_profile", { _user_id: context.userId, _profile_id: kit.profile_id });
    if (ok !== true) throw new Error("Not allowed");
    const { processPressKit: run } = await import("./presskit.server");
    return run(kit.id);
  });

export type DeleteMediaResult = { ok: true } | { ok: false; reason: "not_found" | "forbidden" | "published" | "drafts" | "compositions" | "failed"; count?: number };

/** Curators and the project's team: delete one library image unless a draft uses it; removes the file. */
export const deleteMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mediaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<DeleteMediaResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: m } = await sb.from("marketing_project_media").select("id, profile_id, storage_path").eq("id", data.mediaId).maybeSingle();
    if (!m) return { ok: false, reason: "not_found" };
    const { data: ok } = await sb.rpc("marketing_can_brief_profile", { _user_id: context.userId, _profile_id: m.profile_id });
    if (ok !== true) return { ok: false, reason: "forbidden" };
    const { data: block } = await sb.rpc("marketing_media_delete_block", { _media_id: m.id });
    if (block === "published") return { ok: false, reason: "published" };
    if (typeof block === "string" && block.startsWith("compositions:")) return { ok: false, reason: "compositions", count: Number(block.split(":")[1]) };
    if (typeof block === "string" && block.startsWith("drafts:")) return { ok: false, reason: "drafts", count: Number(block.split(":")[1]) };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { error } = await admin.from("marketing_project_media").delete().eq("id", m.id);
    if (error) { console.error("deleteMedia:", error.message); return { ok: false, reason: "failed" }; }
    const { error: se } = await admin.storage.from("marketing-assets").remove([m.storage_path]);
    if (se) console.error("deleteMedia: file removal failed", m.id, se.message);
    return { ok: true };
  });
