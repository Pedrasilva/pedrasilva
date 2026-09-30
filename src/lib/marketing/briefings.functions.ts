import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BriefingRow = {
  id: string; created_at: string; status: "processing" | "done" | "failed"; error: string | null;
  transcript: string | null; recordedByName: string; audioUrl: string | null; fromRequest: boolean;
};

/** Curators and the project's team: briefings of one profile (read as the caller, so RLS decides). */
export const listBriefings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ profileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BriefingRow[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any).from("marketing_project_briefings")
      .select("id, created_at, status, error, transcript, recorded_by, audio_path, nudge_id")
      .eq("profile_id", data.profileId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { admin, userName } = await import("./nudges.server");
    const db = await admin();
    const out: BriefingRow[] = [];
    for (const r of (rows ?? []) as Array<{ id: string; created_at: string; status: BriefingRow["status"]; error: string | null; transcript: string | null; recorded_by: string; audio_path: string; nudge_id: string | null }>) {
      const { data: s } = await db.storage.from("marketing-voice").createSignedUrl(r.audio_path, 3600);
      out.push({
        id: r.id, created_at: r.created_at, status: r.status, error: r.error, transcript: r.transcript,
        recordedByName: (await userName(r.recorded_by)).name, audioUrl: s?.signedUrl ?? null, fromRequest: !!r.nudge_id,
      });
    }
    return out;
  });

/** Curators and the project's team: record or upload a briefing. */
export const recordBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    profileId: z.string().uuid(),
    audioBase64: z.string().min(10).max(36_000_000),
    mime: z.string().max(100).default("audio/wav"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ok } = await (context.supabase as any).rpc("marketing_can_brief_profile", { _user_id: context.userId, _profile_id: data.profileId });
    if (ok !== true) throw new Error("Not allowed");
    const bytes = Uint8Array.from(atob(data.audioBase64), (ch) => ch.charCodeAt(0));
    const m = data.mime.toLowerCase();
    const ext = m.includes("wav") ? "wav" : m.includes("webm") ? "webm" : m.includes("mpeg") || m.includes("mp3") ? "mp3" : m.includes("ogg") ? "ogg" : "m4a";
    const { admin, createBriefing, processBriefing } = await import("./nudges.server");
    const { id } = await createBriefing(await admin(), { profileId: data.profileId, recordedBy: context.userId, bytes, mime: data.mime, ext });
    await processBriefing(id, bytes);
    return { id };
  });

/** Curators: retry a failed briefing. */
export const retryBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ briefingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_module_permission", {
      _user_id: context.userId, _key: "marketing.curate", _required_scope: "all",
    } as never);
    if (ok !== true) throw new Error("Not allowed");
    const { processBriefing } = await import("./nudges.server");
    await processBriefing(data.briefingId);
    return { ok: true };
  });
