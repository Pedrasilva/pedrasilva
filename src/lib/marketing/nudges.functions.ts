import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: string, args: unknown) => PromiseLike<{ data: unknown; error: unknown }> }; userId: string };

async function requireCurator(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_module_permission", {
    _user_id: context.userId, _key: "marketing.curate", _required_scope: "all",
  } as never);
  if (error || data !== true) throw new Error("Not allowed");
}

/** Curators: AI-drafted question for a capture. */
export const suggestNudgeQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ captureId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireCurator(context as unknown as Ctx);
    const { draftNudgeQuestion } = await import("./nudges.server");
    return { question: await draftNudgeQuestion(data.captureId) };
  });

export type NudgeRecipient = { userId: string; name: string; email: string; onTeam: boolean };

/** Curators: people who can be asked. Project team first (pm_project_team → pm_resources, matched by email), then staff. */
export const listNudgeRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ captureId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ recipients: NudgeRecipient[]; senderUserId: string | null }> => {
    await requireCurator(context as unknown as Ctx);
    const { admin } = await import("./nudges.server");
    const db = await admin();
    const { data: c } = await db.from("marketing_captures").select("project_id, created_by, sender_email").eq("id", data.captureId).single();
    const teamIds = new Set<string>();
    if (c?.project_id) {
      const { data: team } = await db.from("pm_project_team").select("resource_id").eq("project_id", c.project_id);
      for (const t of team ?? []) teamIds.add(t.resource_id);
    }
    const { data: res } = await db.from("pm_resources").select("id, name, email, active").not("email", "is", null);
    const users: { id: string; email?: string }[] = [];
    for (let page = 1; page < 10; page++) {
      const { data: u } = await db.auth.admin.listUsers({ page, perPage: 200 });
      users.push(...(u?.users ?? []));
      if (!u || u.users.length < 200) break;
    }
    const byEmail = new Map(users.filter((u) => u.email).map((u) => [u.email!.trim().toLowerCase(), u.id]));
    const out = new Map<string, NudgeRecipient>();
    for (const r of (res ?? []) as { id: string; name: string; email: string; active: boolean | null }[]) {
      const uid = byEmail.get(r.email.trim().toLowerCase());
      if (!uid) continue;
      const onTeam = teamIds.has(r.id);
      if (!onTeam && r.active === false) continue;
      const prev = out.get(uid);
      if (!prev || (onTeam && !prev.onTeam)) out.set(uid, { userId: uid, name: r.name, email: r.email, onTeam });
    }
    const sender = c?.created_by ?? (c?.sender_email ? byEmail.get(String(c.sender_email).toLowerCase()) ?? null : null);
    const recipients = [...out.values()].sort((a, b) => Number(b.onTeam) - Number(a.onTeam) || a.name.localeCompare(b.name));
    return { recipients, senderUserId: sender };
  });

/** Curators: create and send a nudge. */
export const sendNudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    captureId: z.string().uuid(),
    architectUserId: z.string().uuid(),
    question: z.string().trim().min(3).max(1000),
    aiSuggestedQuestion: z.string().max(1000).default(""),
    channel: z.enum(["hub", "email", "whatsapp"]),
    expiresInDays: z.number().int().min(1).max(60).default(7),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireCurator(context as unknown as Ctx);
    if (data.channel === "whatsapp") throw new Error("WhatsApp channel not connected yet");
    const { admin, userName, captureImageUrls, NUDGE_APP_URL } = await import("./nudges.server");
    const db = await admin();
    const { data: c } = await db.from("marketing_captures").select("id, project_id, pm_projects(name)").eq("id", data.captureId).single();
    if (!c) throw new Error("Capture not found");

    const now = new Date();
    const expires = new Date(now.getTime() + data.expiresInDays * 86400_000);
    // Insert as the curator so RLS applies; created_by defaults to auth.uid().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nudge, error } = await (context.supabase as any).from("marketing_nudges").insert({
      capture_id: c.id, project_id: c.project_id, architect_user_id: data.architectUserId,
      question: data.question, ai_suggested_question: data.aiSuggestedQuestion || data.question,
      channel: data.channel, sent_at: now.toISOString(), expires_at: expires.toISOString(),
    }).select("id").single();
    if (error || !nudge) throw new Error(error?.message ?? "Could not create the question");

    const sender = await userName(context.userId);
    const first = sender.name.split(/\s+/)[0] || sender.name;
    const project = c.pm_projects?.name ?? "uma captura";
    const link = `/nudges/${nudge.id}`;
    await db.from("notifications").insert({
      user_id: data.architectUserId, kind: "marketing_nudge", module: "marketing",
      entity_type: "marketing_nudge", entity_id: nudge.id,
      title: `${first} perguntou sobre ${project} · ${first} asked about ${project}`,
      body: data.question, link_path: link, dedupe_key: `marketing_nudge:${nudge.id}`,
    });

    if (data.channel === "email") {
      const arch = await userName(data.architectUserId);
      if (!arch.email) throw new Error("The architect has no email address");
      const thumbs = (await captureImageUrls(c.id, 2, 7 * 86400)).map((i) => i.url);
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("marketing-nudge", arch.email, {
        idempotencyKey: `marketing-nudge-${nudge.id}`,
        templateData: { senderName: sender.name, projectName: project, question: data.question, thumbs, answerUrl: `${NUDGE_APP_URL}${link}` },
      });
    }
    return { id: nudge.id as string };
  });

export type MyNudge = {
  id: string; question: string; status: string; expired: boolean; answer_text: string | null;
  answered_at: string | null; projectName: string | null; senderName: string; captureText: string | null;
  images: string[]; audioUrl: string | null;
};

/** The nudge's architect (or a curator): load the nudge and its photos. */
export const getNudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ nudgeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MyNudge> => {
    // Read as the caller: RLS returns it only to its architect or a curator.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: n } = await (context.supabase as any).from("marketing_nudges").select("*").eq("id", data.nudgeId).maybeSingle();
    if (!n) throw new Error("Not found");
    const { admin, captureImageUrls, userName } = await import("./nudges.server");
    const db = await admin();
    const { data: c } = await db.from("marketing_captures").select("raw_text, pm_projects(name)").eq("id", n.capture_id).single();
    let audioUrl: string | null = null;
    if (n.answer_audio_path) {
      const { data: s } = await db.storage.from("marketing-voice").createSignedUrl(n.answer_audio_path, 3600);
      audioUrl = s?.signedUrl ?? null;
    }
    return {
      id: n.id, question: n.question, status: n.status,
      expired: n.status === "pending" && !!n.expires_at && new Date(n.expires_at) < new Date(),
      answer_text: n.answer_text, answered_at: n.answered_at,
      projectName: c?.pm_projects?.name ?? null, senderName: (await userName(n.created_by)).name,
      captureText: c?.raw_text ?? null, images: (await captureImageUrls(n.capture_id, 4)).map((i) => i.url), audioUrl,
    };
  });

/** The nudge's architect: answer by text or voice, or dismiss. */
export const submitNudgeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    nudgeId: z.string().uuid(),
    dismiss: z.boolean().default(false),
    text: z.string().max(8000).optional(),
    audioBase64: z.string().max(40_000_000).optional(),
    mime: z.string().max(100).default("audio/wav"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, transcribe, pickStoryField } = await import("./nudges.server");
    const db = await admin();
    const { data: n } = await db.from("marketing_nudges").select("*").eq("id", data.nudgeId).maybeSingle();
    if (!n || n.architect_user_id !== context.userId) throw new Error("Not allowed");
    if (n.status !== "pending") throw new Error("This question is no longer open");
    if (n.expires_at && new Date(n.expires_at) < new Date()) throw new Error("This question has expired");

    if (data.dismiss) {
      await db.from("marketing_nudges").update({ status: "dismissed", answered_at: new Date().toISOString() }).eq("id", n.id);
      return { status: "dismissed" as const, hasProfile: true };
    }

    let text = (data.text ?? "").trim();
    let audioPath: string | null = null;
    if (data.audioBase64) {
      const bytes = Uint8Array.from(atob(data.audioBase64), (ch) => ch.charCodeAt(0));
      const ext = data.mime.includes("wav") ? "wav" : data.mime.includes("webm") ? "webm" : data.mime.includes("mp4") || data.mime.includes("m4a") ? "m4a" : "audio";
      audioPath = `${n.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await db.storage.from("marketing-voice").upload(audioPath, bytes, { contentType: data.mime });
      if (upErr) throw new Error(`Could not store the voice note: ${upErr.message}`);
      const transcript = (await transcribe(bytes, data.mime, `answer.${ext}`)).trim();
      text = text ? `${text}\n${transcript}` : transcript;
    }
    if (!text) throw new Error("The answer is empty");

    const answeredAt = new Date().toISOString();
    let suggestionId: string | null = null;
    const { data: profile } = n.project_id
      ? await db.from("marketing_project_profiles").select("id").eq("project_id", n.project_id).maybeSingle()
      : { data: null };
    if (profile) {
      const field = await pickStoryField(text);
      const { data: s } = await db.from("marketing_project_story_suggestions").insert({
        profile_id: profile.id, capture_id: n.capture_id, field, suggested_text: text.slice(0, 2000), source: "architect_answer",
      }).select("id").single();
      suggestionId = s?.id ?? null;
    }
    await db.from("marketing_nudges").update({
      answer_text: text, answer_audio_path: audioPath, answered_at: answeredAt, status: "answered", story_suggestion_id: suggestionId,
    }).eq("id", n.id);

    const { data: c } = await db.from("marketing_captures").select("curator_notes").eq("id", n.capture_id).single();
    if (c && !c.curator_notes?.trim()) {
      await db.from("marketing_captures").update({ curator_notes: text.slice(0, 4000) }).eq("id", n.capture_id);
    }
    await db.from("notifications").insert({
      user_id: n.created_by, kind: "marketing_nudge_answered", module: "marketing",
      entity_type: "marketing_nudge", entity_id: n.id,
      title: "Resposta recebida · Answer received", body: text.slice(0, 300),
      link_path: `/marketing?capture=${n.capture_id}`, dedupe_key: `marketing_nudge_answered:${n.id}`,
    });
    return { status: "answered" as const, hasProfile: !!profile };
  });
