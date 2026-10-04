import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DeleteCaptureResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" | "published" | "drafts" | "failed"; count?: number };

/** Permanently deletes a capture. Checks run as the caller; storage cleanup + delete use the service role. */
export const deleteCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ captureId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<DeleteCaptureResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: cap } = await sb.from("marketing_captures")
      .select("id, created_by, status, source_message_id, sender_email").eq("id", data.captureId).maybeSingle();
    if (!cap) return { ok: false, reason: "not_found" };
    const { data: isCurator } = await sb.rpc("has_module_permission", { _user_id: context.userId, _key: "marketing.curate", _required_scope: "all" });
    const own = cap.created_by === context.userId && (cap.status === "new" || cap.status === "enriched");
    if (!isCurator && !own) return { ok: false, reason: "forbidden" };
    const { data: block } = await sb.rpc("marketing_capture_delete_block", { _capture_id: cap.id });
    if (block === "published") return { ok: false, reason: "published" };
    if (typeof block === "string" && block.startsWith("drafts:")) return { ok: false, reason: "drafts", count: Number(block.split(":")[1]) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    // Collect file paths first, delete all database rows in one transaction,
    // and only remove files once that has succeeded.
    const { data: assets } = await admin.from("marketing_capture_assets").select("storage_path").eq("capture_id", cap.id);
    const paths = ((assets ?? []) as { storage_path: string }[]).map((a) => a.storage_path);
    const { data: folder } = await admin.storage.from("marketing-assets").list(cap.id, { limit: 1000 });
    for (const f of (folder ?? []) as { name: string }[]) paths.push(`${cap.id}/${f.name}`);
    const unique = [...new Set(paths)];
    const notesDir = `capture-notes/${cap.id}`;
    const { data: nv } = await admin.storage.from("marketing-voice").list(notesDir, { limit: 1000 });
    const voicePaths = ((nv ?? []) as { name: string }[]).map((f) => `${notesDir}/${f.name}`);

    const { data: nudgeIds, error: delErr } = await admin.rpc("marketing_delete_capture_rows", { _capture_id: cap.id });
    if (delErr) { console.error("deleteCapture: delete failed", delErr.message); return { ok: false, reason: "failed" }; }

    for (const id of (nudgeIds ?? []) as string[]) {
      const { data: voice } = await admin.storage.from("marketing-voice").list(id, { limit: 1000 });
      for (const f of (voice ?? []) as { name: string }[]) voicePaths.push(`${id}/${f.name}`);
    }
    if (unique.length) {
      const { error } = await admin.storage.from("marketing-assets").remove(unique);
      if (error) console.error("deleteCapture: asset removal failed", cap.id, error.message);
    }
    if (voicePaths.length) {
      const { error } = await admin.storage.from("marketing-voice").remove(voicePaths);
      if (error) console.error("deleteCapture: voice removal failed", cap.id, error.message);
    }
    return { ok: true };
  });
