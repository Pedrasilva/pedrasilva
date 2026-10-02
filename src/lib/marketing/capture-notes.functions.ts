import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_SECONDS = 600;

type Ctx = { supabase: { rpc: (fn: string, args: unknown) => PromiseLike<{ data: unknown; error: unknown }> }; userId: string };

async function canNote(context: Ctx, captureId: string) {
  const { data, error } = await context.supabase.rpc("marketing_can_note_capture", { _user_id: context.userId, _capture_id: captureId } as never);
  return !error && data === true;
}

/** WAV duration from the header (16-bit PCM); null when not a WAV. */
function wavSeconds(b: Uint8Array): number | null {
  if (b.length < 44 || String.fromCharCode(...b.slice(0, 4)) !== "RIFF") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const byteRate = v.getUint32(28, true);
  return byteRate ? (b.length - 44) / byteRate : null;
}

async function displayNames(db: any, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of [...new Set(ids)]) {
    const { data } = await db.auth.admin.getUserById(id);
    const u = data?.user;
    const email: string = u?.email ?? "";
    let name: string = u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "";
    if (!name && email) {
      const { data: r } = await db.from("pm_resources").select("name").ilike("email", email).limit(1).maybeSingle();
      name = r?.name ?? email.split("@")[0];
    }
    out.set(id, name || "—");
  }
  return out;
}

/** Can the caller add a note to this capture? */
export const canAddCaptureNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ captureId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => ({ allowed: await canNote(context as unknown as Ctx, data.captureId) }));

/** Notes for a capture (RLS as the caller), with author names and signed audio URLs. */
export const listCaptureNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ captureId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.from("marketing_capture_notes").select("*")
      .eq("capture_id", data.captureId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{ id: string; author_user_id: string; text: string; audio_path: string | null; source: string; story_suggestion_id: string | null; created_at: string }>;
    if (!list.length) return { notes: [] };
    const { admin } = await import("./nudges.server");
    const db = await admin();
    const names = await displayNames(db, list.map((n) => n.author_user_id));
    const notes = [];
    for (const n of list) {
      let audioUrl: string | null = null;
      if (n.audio_path) {
        const { data: s } = await sb.storage.from("marketing-voice").createSignedUrl(n.audio_path, 3600);
        audioUrl = s?.signedUrl ?? null;
      }
      notes.push({ ...n, authorName: names.get(n.author_user_id) ?? "—", audioUrl, mine: n.author_user_id === context.userId });
    }
    return { notes };
  });

/** Add a voice or text note; transcribe, suggest to the profile, re-run the AI analysis. */
export const addCaptureNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    captureId: z.string().uuid(),
    text: z.string().max(8000).optional(),
    audioBase64: z.string().max(36_000_000).optional(),
    mime: z.string().max(100).default("audio/wav"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await canNote(context as unknown as Ctx, data.captureId))) throw new Error("Not allowed");
    const { admin, transcribe, transcriptionHint, pickStoryField } = await import("./nudges.server");
    const db = await admin();
    const { data: c } = await db.from("marketing_captures").select("id, project_id").eq("id", data.captureId).maybeSingle();
    if (!c) throw new Error("Capture not found");

    let text = (data.text ?? "").trim();
    let audioPath: string | null = null;
    if (data.audioBase64) {
      if (!data.mime.startsWith("audio/")) throw new Error("Audio files only");
      const bytes = Uint8Array.from(atob(data.audioBase64), (ch) => ch.charCodeAt(0));
      if (bytes.length > MAX_BYTES) throw new Error("Recording too large (max 25 MB)");
      const secs = wavSeconds(bytes);
      if (secs != null && secs > MAX_SECONDS + 5) throw new Error("Recording too long (max 10 minutes)");
      const ext = data.mime.includes("wav") ? "wav" : data.mime.includes("webm") ? "webm" : data.mime.includes("mp4") || data.mime.includes("m4a") ? "m4a" : "audio";
      audioPath = `capture-notes/${c.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await db.storage.from("marketing-voice").upload(audioPath, bytes, { contentType: data.mime });
      if (upErr) throw new Error(`Could not store the voice note: ${upErr.message}`);
      try {
        const transcript = (await transcribe(bytes, data.mime, `note.${ext}`, await transcriptionHint(db, c.project_id))).trim();
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

    let suggestionId: string | null = null;
    if (c.project_id) {
      const { data: prof } = await db.from("marketing_project_profiles").select("id").eq("project_id", c.project_id).maybeSingle();
      if (prof) {
        const field = await pickStoryField(text);
        const { data: s } = await db.from("marketing_project_story_suggestions").insert({
          profile_id: prof.id, capture_id: c.id, field, suggested_text: text.slice(0, 2000), source: "team_note",
        }).select("id").single();
        suggestionId = s?.id ?? null;
      }
    }

    const { data: note, error } = await db.from("marketing_capture_notes").insert({
      capture_id: c.id, author_user_id: context.userId, text: text.slice(0, 8000), audio_path: audioPath,
      source: audioPath ? "voice" : "text", story_suggestion_id: suggestionId,
    }).select("id").single();
    if (error) throw new Error(error.message);

    // Re-run the AI analysis now with the new context (fills empty curation fields; refreshes AI-written ones only).
    let reanalysed = false;
    try {
      const { loadEnrichContext, enrichCapture } = await import("./enrich.server");
      const ctx = await loadEnrichContext();
      if (ctx) { await enrichCapture(c.id, ctx, true); reanalysed = true; }
    } catch (e) { console.warn("[capture-notes] re-analysis failed:", e instanceof Error ? e.message : e); }

    return { id: note.id as string, hasSuggestion: !!suggestionId, reanalysed };
  });

/** Delete a note (author or curator); removes the audio file. */
export const deleteCaptureNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ noteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: n } = await sb.from("marketing_capture_notes").select("id, audio_path").eq("id", data.noteId).maybeSingle();
    if (!n) throw new Error("Note not found");
    const { data: gone, error } = await sb.from("marketing_capture_notes").delete().eq("id", n.id).select("id");
    if (error || !gone?.length) throw new Error("Not allowed");
    if (n.audio_path) {
      const { admin } = await import("./nudges.server");
      await (await admin()).storage.from("marketing-voice").remove([n.audio_path]);
    }
    return { ok: true };
  });
