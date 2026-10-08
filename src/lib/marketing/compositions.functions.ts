import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_SECONDS = 600;

type Ctx = { supabase: { rpc: (fn: string, args: unknown) => PromiseLike<{ data: unknown; error: unknown }> }; userId: string };

async function isCurator(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_module_permission", {
    _user_id: context.userId, _key: "marketing.curate", _required_scope: "all",
  } as never);
  return !error && data === true;
}

function wavSeconds(b: Uint8Array): number | null {
  if (b.length < 44 || String.fromCharCode(...b.slice(0, 4)) !== "RIFF") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const byteRate = v.getUint32(28, true);
  return byteRate ? (b.length - 44) / byteRate : null;
}

export type CompositionComment = {
  id: string; slide_id: string | null; text: string; created_at: string; authorName: string;
  audioUrl: string | null; mine: boolean; fromQuestion: boolean;
};

/** Comments of a carousel (read as the caller), with author names and signed audio URLs. */
export const listCompositionComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ compositionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ comments: CompositionComment[] }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.from("marketing_composition_comments").select("*")
      .eq("composition_id", data.compositionId).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{ id: string; slide_id: string | null; author_user_id: string; text: string; audio_path: string | null; nudge_id: string | null; created_at: string }>;
    if (!list.length) return { comments: [] };
    const { admin, userName } = await import("./nudges.server");
    const db = await admin();
    const names = new Map<string, string>();
    for (const id of new Set(list.map((c) => c.author_user_id))) names.set(id, (await userName(id)).name || "—");
    const out: CompositionComment[] = [];
    for (const c of list) {
      let audioUrl: string | null = null;
      if (c.audio_path) {
        const { data: s } = await db.storage.from("marketing-voice").createSignedUrl(c.audio_path, 3600);
        audioUrl = s?.signedUrl ?? null;
      }
      out.push({ id: c.id, slide_id: c.slide_id, text: c.text, created_at: c.created_at, authorName: names.get(c.author_user_id) ?? "—",
        audioUrl, mine: c.author_user_id === context.userId, fromQuestion: !!c.nudge_id });
    }
    return { comments: out };
  });

/** Add a typed or recorded comment on the carousel or one slide. */
export const addCompositionComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    compositionId: z.string().uuid(),
    slideId: z.string().uuid().nullable().optional(),
    text: z.string().max(8000).optional(),
    audioBase64: z.string().max(36_000_000).optional(),
    mime: z.string().max(100).default("audio/wav"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: canView } = await context.supabase.rpc("has_module_permission", {
      _user_id: context.userId, _key: "marketing.view", _required_scope: "all",
    } as never);
    if (canView !== true) throw new Error("Not allowed");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: comp } = await sb.from("marketing_compositions").select("id, marketing_project_profiles(project_id)").eq("id", data.compositionId).maybeSingle();
    if (!comp) throw new Error("Carousel not found");
    if (data.slideId) {
      const { data: s } = await sb.from("marketing_composition_slides").select("id").eq("id", data.slideId).eq("composition_id", comp.id).maybeSingle();
      if (!s) throw new Error("Slide not found");
    }
    const { admin, transcribe, transcriptionHint } = await import("./nudges.server");
    const db = await admin();
    let text = (data.text ?? "").trim();
    let audioPath: string | null = null;
    if (data.audioBase64) {
      if (!data.mime.startsWith("audio/")) throw new Error("Audio files only");
      const bytes = Uint8Array.from(atob(data.audioBase64), (ch) => ch.charCodeAt(0));
      if (bytes.length > MAX_BYTES) throw new Error("Recording too large (max 25 MB)");
      const secs = wavSeconds(bytes);
      if (secs != null && secs > MAX_SECONDS + 5) throw new Error("Recording too long (max 10 minutes)");
      const ext = data.mime.includes("wav") ? "wav" : data.mime.includes("webm") ? "webm" : data.mime.includes("mp4") || data.mime.includes("m4a") ? "m4a" : "audio";
      audioPath = `compositions/${comp.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await db.storage.from("marketing-voice").upload(audioPath, bytes, { contentType: data.mime });
      if (upErr) throw new Error(`Could not store the voice note: ${upErr.message}`);
      try {
        const transcript = (await transcribe(bytes, data.mime, `comment.${ext}`, await transcriptionHint(db, comp.marketing_project_profiles?.project_id ?? null))).trim();
        text = [text, transcript].filter(Boolean).join("\n\n");
      } catch (e) {
        await db.storage.from("marketing-voice").remove([audioPath]);
        throw e;
      }
    }
    if (!text) {
      if (audioPath) await db.storage.from("marketing-voice").remove([audioPath]);
      throw new Error("Nothing was said or typed");
    }
    const { data: row, error } = await sb.from("marketing_composition_comments").insert({
      composition_id: comp.id, slide_id: data.slideId ?? null, text: text.slice(0, 8000), audio_path: audioPath,
    }).select("id").single();
    if (error) {
      if (audioPath) await db.storage.from("marketing-voice").remove([audioPath]);
      throw new Error(error.message);
    }
    return { id: row.id as string };
  });

/** Delete a comment (author or curator); removes the audio file. */
export const deleteCompositionComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ commentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: c } = await sb.from("marketing_composition_comments").select("id, audio_path").eq("id", data.commentId).maybeSingle();
    if (!c) throw new Error("Comment not found");
    const { data: gone, error } = await sb.from("marketing_composition_comments").delete().eq("id", c.id).select("id");
    if (error || !gone?.length) throw new Error("Not allowed");
    if (c.audio_path) {
      const { admin } = await import("./nudges.server");
      await (await admin()).storage.from("marketing-voice").remove([c.audio_path]);
    }
    return { ok: true };
  });

/** Curators: AI-drafted question about the carousel's sequence. */
export const suggestCompositionQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ compositionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isCurator(context as unknown as Ctx))) throw new Error("Not allowed");
    const { draftCompositionQuestion } = await import("./compositions.server");
    return { question: await draftCompositionQuestion(data.compositionId) };
  });

/** Curators: write the Instagram + LinkedIn copy for the fixed sequence and send it to the planner as one idea. */
export const writeComposedPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ compositionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isCurator(context as unknown as Ctx))) throw new Error("Not allowed");
    const { writeComposedPost: run } = await import("./compositions.server");
    return await run(data.compositionId, context.userId);
  });

/** Editors: make an editable copy (slides, not comments) of a carousel. Runs as the caller, so RLS decides. */
export const duplicateComposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ compositionId: z.string().uuid(), title: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: comp } = await sb.from("marketing_compositions").select("*").eq("id", data.compositionId).maybeSingle();
    if (!comp) throw new Error("Carousel not found");
    const { data: copy, error } = await sb.from("marketing_compositions").insert({
      profile_id: comp.profile_id, title: data.title, intent: comp.intent, duplicated_from: comp.id, created_by: context.userId,
    }).select("id").single();
    if (error || !copy) throw new Error(error?.message ?? "Not allowed");
    const { data: slides } = await sb.from("marketing_composition_slides").select("*").eq("composition_id", comp.id).order("position");
    const rows = ((slides ?? []) as Record<string, unknown>[]).map((s, i) => ({
      composition_id: copy.id, position: i, kind: s.kind, media_id: s.media_id, capture_asset_id: s.capture_asset_id,
      text_heading: s.text_heading, text_body: s.text_body, design_media_id: s.design_media_id,
    }));
    if (rows.length) {
      const { error: sErr } = await sb.from("marketing_composition_slides").insert(rows);
      if (sErr) throw new Error(sErr.message);
    }
    return { id: copy.id as string };
  });
