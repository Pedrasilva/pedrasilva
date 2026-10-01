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
  .inputValidator((d) => z.object({ captureId: z.string().uuid().optional(), projectId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ recipients: NudgeRecipient[]; senderUserId: string | null }> => {
    await requireCurator(context as unknown as Ctx);
    const { admin } = await import("./nudges.server");
    const db = await admin();
    const { data: c } = data.captureId
      ? await db.from("marketing_captures").select("project_id, created_by, sender_email").eq("id", data.captureId).single()
      : { data: null };
    const projectId = c?.project_id ?? data.projectId ?? null;
    const teamIds = new Set<string>();
    if (projectId) {
      const { data: team } = await db.from("pm_project_team").select("resource_id").eq("project_id", projectId);
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
    const sender = c ? (c.created_by ?? (c.sender_email ? byEmail.get(String(c.sender_email).toLowerCase()) ?? null : null)) : null;
    out.delete(context.userId);
    const recipients = [...out.values()].sort((a, b) => Number(b.onTeam) - Number(a.onTeam) || a.name.localeCompare(b.name));
    return { recipients, senderUserId: sender };
  });

/** Curators: AI-suggested prompt for a briefing request. */
export const suggestBriefingPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireCurator(context as unknown as Ctx);
    const { draftBriefingPrompt } = await import("./nudges.server");
    return { question: await draftBriefingPrompt(data.projectId) };
  });

/** Curators: create and send a nudge (a question about a capture, or a briefing request about a project). */
export const sendNudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    kind: z.enum(["question", "briefing"]).default("question"),
    captureId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    architectUserId: z.string().uuid(),
    question: z.string().trim().min(3).max(1000),
    aiSuggestedQuestion: z.string().max(1000).default(""),
    channel: z.enum(["hub", "email", "whatsapp"]),
    expiresInDays: z.number().int().min(1).max(60).default(7),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireCurator(context as unknown as Ctx);
    if (data.channel === "whatsapp") throw new Error("WhatsApp channel not connected yet");
    const { admin, deliverNudge } = await import("./nudges.server");
    const db = await admin();
    let captureId: string | null = null;
    let projectId: string | null = null;
    if (data.kind === "question") {
      if (!data.captureId) throw new Error("Capture missing");
      const { data: c } = await db.from("marketing_captures").select("id, project_id").eq("id", data.captureId).single();
      if (!c) throw new Error("Capture not found");
      captureId = c.id; projectId = c.project_id;
    } else {
      if (!data.projectId) throw new Error("Project missing");
      projectId = data.projectId;
    }
    if (data.architectUserId === context.userId) throw new Error("Não pode enviar uma pergunta a si próprio.");
    {
      const since = new Date(Date.now() - 120_000).toISOString();
      let dq = db.from("marketing_nudges").select("id").eq("architect_user_id", data.architectUserId)
        .eq("kind", data.kind).eq("status", "pending").eq("question", data.question).gte("created_at", since).limit(1);
      dq = captureId ? dq.eq("capture_id", captureId) : dq.is("capture_id", null).eq("project_id", projectId!);
      const { data: dup } = await dq;
      if (dup && dup.length) throw new Error("Esta pergunta já foi enviada.");
    }
    const now = new Date();
    const expires = new Date(now.getTime() + data.expiresInDays * 86400_000);
    // Insert as the curator so RLS applies; created_by defaults to auth.uid().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nudge, error } = await (context.supabase as any).from("marketing_nudges").insert({
      kind: data.kind, capture_id: captureId, project_id: projectId, architect_user_id: data.architectUserId,
      question: data.question, ai_suggested_question: data.aiSuggestedQuestion || data.question,
      channel: data.channel, sent_at: now.toISOString(), expires_at: expires.toISOString(),
    }).select("id").single();
    if (error || !nudge) throw new Error(error?.message ?? "Could not create the question");
    await deliverNudge(db, nudge.id, context.userId);
    return { id: nudge.id as string };
  });

/** Curators: delete nudges — voice files, the architect's notifications, then the rows. Suggestions/briefings stay (FKs set null). */
export const deleteNudges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireCurator(context as unknown as Ctx);
    const { admin } = await import("./nudges.server");
    const db = await admin();
    for (const id of data.ids) {
      const { data: files } = await db.storage.from("marketing-voice").list(id, { limit: 1000 });
      const paths = (files ?? []).filter((f) => f.name).map((f) => `${id}/${f.name}`);
      if (paths.length) await db.storage.from("marketing-voice").remove(paths);
    }
    await db.from("notifications").delete().eq("entity_type", "marketing_nudge").in("entity_id", data.ids);
    const { error } = await db.from("marketing_nudges").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: data.ids.length };
  });

/** Curators: re-send a pending nudge by the same channel (no new nudge, same question and expiry). */
export const resendNudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ nudgeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireCurator(context as unknown as Ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: n } = await (context.supabase as any).from("marketing_nudges").select("id, status, expires_at").eq("id", data.nudgeId).maybeSingle();
    if (!n) throw new Error("Not found");
    if (n.status !== "pending" || (n.expires_at && new Date(n.expires_at) < new Date())) throw new Error("Only open questions can be re-sent");
    const { admin, deliverNudge } = await import("./nudges.server");
    await deliverNudge(await admin(), n.id, context.userId, true);
    return { ok: true };
  });

export type NudgeOverviewRow = {
  id: string; kind: "question" | "briefing"; channel: string; question: string; status: string; expired: boolean;
  sent_at: string | null; answered_at: string | null; capture_id: string | null; project_id: string | null;
  projectName: string | null; profileId: string | null; created_by: string; createdByName: string;
  architect_user_id: string; architectName: string;
};

/** Curators: every nudge with names for the Questions page. */
export const listNudgesOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NudgeOverviewRow[]> => {
    await requireCurator(context as unknown as Ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.from("marketing_nudges")
      .select("id, kind, channel, question, status, expires_at, sent_at, answered_at, capture_id, project_id, created_by, architect_user_id, created_at")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<Record<string, any>>;
    const pids = [...new Set(list.map((r) => r.project_id).filter(Boolean))];
    const { data: pn } = pids.length ? await sb.from("pm_projects").select("id, name").in("id", pids) : { data: [] };
    const nameBy = new Map<string, string>(((pn ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
    const { data: profs } = pids.length ? await sb.from("marketing_project_profiles").select("id, project_id").in("project_id", pids) : { data: [] };
    const profBy = new Map<string, string>(((profs ?? []) as { id: string; project_id: string }[]).map((p) => [p.project_id, p.id]));
    const { userName } = await import("./nudges.server");
    const names = new Map<string, string>();
    for (const uid of new Set(list.flatMap((r) => [r.created_by, r.architect_user_id]))) names.set(uid, (await userName(uid)).name);
    const now = Date.now();
    return list.map((r) => ({
      id: r.id, kind: r.kind, channel: r.channel, question: r.question, status: r.status,
      expired: r.status === "pending" && !!r.expires_at && new Date(r.expires_at).getTime() < now,
      sent_at: r.sent_at, answered_at: r.answered_at, capture_id: r.capture_id, project_id: r.project_id,
      projectName: r.project_id ? nameBy.get(r.project_id) ?? null : null, profileId: r.project_id ? profBy.get(r.project_id) ?? null : null,
      created_by: r.created_by, createdByName: names.get(r.created_by) ?? "—",
      architect_user_id: r.architect_user_id, architectName: names.get(r.architect_user_id) ?? "—",
    }));
  });

export type MyNudge = {
  id: string; question: string; status: string; expired: boolean; answer_text: string | null;
  answered_at: string | null; projectName: string | null; senderName: string; captureText: string | null; kind: "question" | "briefing";
  images: string[]; audioUrl: string | null;
};

export type PendingNudgeForMe = { id: string; kind: "question" | "briefing"; question: string; senderFirstName: string; projectName: string | null };

/** Signed-in architect: their own pending, unexpired nudges (read as the caller via RLS). */
export const listMyPendingNudges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingNudgeForMe[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (context.supabase as any).from("marketing_nudges")
      .select("id, kind, question, created_by, project_id, capture_id, expires_at")
      .eq("architect_user_id", context.userId).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(20);
    const now = Date.now();
    const list = ((rows ?? []) as Array<{ id: string; kind: string | null; question: string; created_by: string; project_id: string | null; capture_id: string | null; expires_at: string | null }>)
      .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now);
    if (!list.length) return [];
    const { admin, userName } = await import("./nudges.server");
    const db = await admin();
    return Promise.all(list.map(async (n) => {
      let projectName: string | null = null;
      if (n.project_id) {
        const { data: p } = await db.from("pm_projects").select("name").eq("id", n.project_id).maybeSingle();
        projectName = p?.name ?? null;
      } else if (n.capture_id) {
        const { data: c } = await db.from("marketing_captures").select("pm_projects(name)").eq("id", n.capture_id).maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projectName = (c as any)?.pm_projects?.name ?? null;
      }
      const full = (await userName(n.created_by)).name ?? "";
      return { id: n.id, kind: (n.kind === "briefing" ? "briefing" : "question") as "question" | "briefing", question: n.question, senderFirstName: full.split(/\s+/)[0] ?? "", projectName };
    }));
  });

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
    const { data: c } = n.capture_id
      ? await db.from("marketing_captures").select("raw_text, pm_projects(name)").eq("id", n.capture_id).single()
      : { data: null };
    const { data: proj } = !c && n.project_id ? await db.from("pm_projects").select("name").eq("id", n.project_id).maybeSingle() : { data: null };
    let audioUrl: string | null = null;
    if (n.answer_audio_path) {
      const { data: s } = await db.storage.from("marketing-voice").createSignedUrl(n.answer_audio_path, 3600);
      audioUrl = s?.signedUrl ?? null;
    }
    return {
      id: n.id, question: n.question, status: n.status,
      expired: n.status === "pending" && !!n.expires_at && new Date(n.expires_at) < new Date(),
      answer_text: n.answer_text, answered_at: n.answered_at,
      kind: n.kind ?? "question",
      projectName: c?.pm_projects?.name ?? proj?.name ?? null, senderName: (await userName(n.created_by)).name,
      captureText: c?.raw_text ?? null, images: n.capture_id ? (await captureImageUrls(n.capture_id, 4)).map((i) => i.url) : [], audioUrl,
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
    const { admin, applyNudgeAnswer } = await import("./nudges.server");
    const db = await admin();
    const { data: n } = await db.from("marketing_nudges").select("*").eq("id", data.nudgeId).maybeSingle();
    if (!n || n.architect_user_id !== context.userId) throw new Error("Not allowed");
    if (n.status !== "pending") throw new Error("This question is no longer open");
    if (n.expires_at && new Date(n.expires_at) < new Date()) throw new Error("This question has expired");

    if (data.dismiss) {
      await db.from("marketing_nudges").update({ status: "dismissed", answered_at: new Date().toISOString() }).eq("id", n.id);
      return { status: "dismissed" as const, hasProfile: true };
    }

    let audioBytes: Uint8Array | undefined;
    let audioExt: string | undefined;
    if (data.audioBase64) {
      audioBytes = Uint8Array.from(atob(data.audioBase64), (ch) => ch.charCodeAt(0));
      if (n.kind === "briefing") {
        const { checkBriefingAudio } = await import("./nudges.server");
        checkBriefingAudio(audioBytes, data.mime);
      }
      audioExt = data.mime.includes("wav") ? "wav" : data.mime.includes("webm") ? "webm" : data.mime.includes("mp4") || data.mime.includes("m4a") ? "m4a" : "audio";
    }
    const { hasProfile } = await applyNudgeAnswer(db, n, { text: data.text, audioBytes, audioMime: data.mime, audioExt });
    return { status: "answered" as const, hasProfile };
  });
