/**
 * Timesheet assistant — turns dictated / typed hours into DRAFT entries for the
 * signed-in user only. Nothing is saved here: the browser saves confirmed
 * drafts through the timesheet's own hooks (useUpsertTimesheetCell /
 * useEnsureStageRow). All reads run as the caller (RLS applies).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AssistantStage = { id: string; name: string; start_date: string; end_date: string };
export type AssistantProject = { id: string; name: string; client: string | null; stages: AssistantStage[] };
export type AssistantExisting = {
  date: string;
  entry_type: "project" | "internal" | "non_working";
  project_id: string | null;
  stage_id: string | null;
  internal_category: string | null;
  label: string;
  hours: number;
};
export type AssistantDraft = {
  date: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  entry_type: "project" | "internal";
  project_id: string | null;
  stage_id: string | null;
  internal_category: string | null;
  note: string;
  confidence: "high" | "low";
};
export type AssistantQuestion = { text: string; options: string[] };
export type AssistantResult = {
  weekStart: string;
  weekEnd: string;
  locked: boolean;
  dailyHours: number;
  projects: AssistantProject[];
  categories: string[];
  existing: AssistantExisting[];
  entries: AssistantDraft[];
  questions: AssistantQuestion[];
};

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function addDaysISO(d: string, n: number): string {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();

const SYSTEM = `You turn a person's spoken or typed description of their working hours into draft timesheet entries.
The text may be Portuguese, English or a mix. Reply with ONE JSON object only, no prose, no code fences:
{"entries":[{"date":"YYYY-MM-DD","start_time":"HH:MM"|null,"end_time":"HH:MM"|null,"hours":number,"entry_type":"project"|"internal","project_id":string|null,"stage_id":string|null,"internal_category":string|null,"note":string,"confidence":"high"|"low"}],
 "questions":[{"text":string,"options":[string]}]}
Rules:
- Create one entry for EVERY activity the person mentions (meetings included), even if something similar is already logged; saving adds to existing hours. "Already logged" only counts towards day totals.
- Write questions in the language of the person's own text (English text → English questions).
- Dates must fall inside the target week given. Resolve "Monday", "yesterday", "on the 24th", "segunda", "ontem" against today's date and the week dates.
- hours: from start/end when given, otherwise as said. Round to 0.25.
- entry_type "project" needs a project_id from the projects list; pick stage_id from THAT project's stages. If the project has exactly one stage use it. If the stage is unclear, set stage_id null, confidence "low", and ask which stage (options = stage names).
- entry_type "internal" needs internal_category copied EXACTLY from the categories list (meetings, training, admin, etc. map to the closest category). project_id and stage_id must be null.
- Match projects by name, client, number or alias, tolerating misspellings and accents. NEVER invent a project, stage or category not in the lists. If nothing matches or two are plausible, still add the entry with project_id null (or your best guess with confidence "low") and ask, with the candidate names as options.
- note: a short note in the person's own words and language (e.g. "layouts and test fits"). No times in the note.
- confidence "low" whenever you guessed anything.
- Never create leave, vacation or holiday entries; those come from HR.
- questions: one per real ambiguity (two possible projects, which stage, unclear day, hours that don't add up). Also, for each working day mentioned whose total (already logged + leave + new entries) is below the person's daily hours, ask e.g. "That's 7 of your 8 hours on Monday. Anything else?" with options like ["That's all"]. Write questions in the language the person used. Max 4 questions. Options are short answers the person can tap (project names, stage names, "That's all"); may be empty.
- If the person answered previous questions, apply the answers and don't ask them again. If they said they're done / "é tudo" / "that's all", ask no more questions about missing hours.`;

export const parseTimesheetDictation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().trim().min(1).max(6000),
        weekStart: iso,
        today: iso,
        answers: z.array(z.object({ q: z.string().max(500), a: z.string().max(1000) })).max(20).default([]),
        done: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AssistantResult> => {
    const db = context.supabase;
    const userId = context.userId;
    const weekStart = data.weekStart;
    const weekEnd = addDaysISO(weekStart, 6);
    if (dow(weekStart) !== 1) throw new Error("weekStart must be a Monday");

    const [{ data: collabId }, weekRow, entriesRes, holRes, catRes, projRes, aliasRes] = await Promise.all([
      db.rpc("get_my_collaborator_id"),
      db.from("pm_timesheet_weeks").select("status").eq("user_id", userId).eq("week_start", weekStart).maybeSingle(),
      db
        .from("pm_time_entries")
        .select("entry_date, hours, entry_type, internal_category, leave_type, task_id")
        .eq("user_id", userId)
        .gte("entry_date", weekStart)
        .lte("entry_date", weekEnd),
      db.from("holidays").select("data, nome").gte("data", weekStart).lte("data", weekEnd),
      db.from("pm_internal_categories").select("name, visible_to_profiles").is("archived_at", null).order("sort_order"),
      db
        .from("pm_projects")
        .select("id, name, client, stages:pm_stages(id, name, start_date, end_date, sort_order, parent_stage_id, is_self)")
        .eq("status", "active")
        .order("name")
        .limit(400),
      db.from("marketing_project_profiles").select("project_id, aliases"),
    ]);
    if (entriesRes.error) throw entriesRes.error;
    if (projRes.error) throw projRes.error;

    const status = (weekRow.data as { status?: string } | null)?.status;
    const locked = status === "submitted" || status === "approved";

    // Schedule, work profile and approved leave.
    let dailyHours = 8;
    let daysPerWeek = 5;
    let workProfile = "project";
    const leaveByDate = new Map<string, { label: string; hours: number }>();
    if (collabId) {
      const [dirRes, profRes, vacRes] = await Promise.all([
        db.from("collaborators_directory").select("daily_hours, days_per_week").eq("id", collabId as string).maybeSingle(),
        db.from("collaborators").select("work_profile").eq("id", collabId as string).maybeSingle(),
        db
          .from("vacation_requests")
          .select("data_inicio, data_fim, tipo, periodo, horas")
          .eq("collaborator_id", collabId as string)
          .in("estado", ["aprovada", "aprovado"])
          .lte("data_inicio", weekEnd)
          .gte("data_fim", weekStart),
      ]);
      const dir = dirRes.data as { daily_hours: number | null; days_per_week: number | null } | null;
      dailyHours = Number(dir?.daily_hours ?? 8);
      daysPerWeek = Number(dir?.days_per_week ?? 5);
      const wp = (profRes.data as { work_profile?: string } | null)?.work_profile;
      if (wp === "mixed" || wp === "support") workProfile = wp;
      for (const v of (vacRes.data ?? []) as Array<{ data_inicio: string; data_fim: string; tipo: string; periodo: string | null; horas: number | null }>) {
        const p = v.periodo ?? "dia_inteiro";
        const h = p === "horas" ? Math.min(Number(v.horas ?? 0), dailyHours) : p === "manha" || p === "tarde" || p === "meio_dia" ? dailyHours / 2 : dailyHours;
        for (let i = 0; i < 7; i++) {
          const d = addDaysISO(weekStart, i);
          if (d >= v.data_inicio && d <= v.data_fim && dow(d) !== 0 && dow(d) !== 6) leaveByDate.set(d, { label: `leave (${v.tipo})`, hours: h });
        }
      }
    }
    for (const h of (holRes.data ?? []) as Array<{ data: string; nome: string }>) {
      if (dow(h.data) !== 0 && dow(h.data) !== 6) leaveByDate.set(h.data, { label: `public holiday — ${h.nome}`, hours: dailyHours });
    }

    const categories = ((catRes.data ?? []) as Array<{ name: string; visible_to_profiles: string[] | null }>)
      .filter((c) => !c.visible_to_profiles?.length || c.visible_to_profiles.includes(workProfile))
      .map((c) => c.name);

    const aliasMap = new Map<string, string[]>();
    for (const a of (aliasRes.data ?? []) as Array<{ project_id: string; aliases: string[] | null }>) {
      if (a.aliases?.length) aliasMap.set(a.project_id, a.aliases);
    }

    type RawStage = { id: string; name: string; start_date: string; end_date: string; sort_order: number; parent_stage_id: string | null; is_self: boolean | null };
    const projects: AssistantProject[] = ((projRes.data ?? []) as Array<{ id: string; name: string; client: string | null; stages: RawStage[] | null }>).map((p) => {
      const raw = p.stages ?? [];
      const parents = new Set(raw.map((s) => s.parent_stage_id).filter(Boolean) as string[]);
      return {
        id: p.id,
        name: p.name,
        client: p.client,
        stages: raw
          .filter((s) => !parents.has(s.id) && s.is_self !== false)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(({ id, name, start_date, end_date }) => ({ id, name, start_date, end_date })),
      };
    });
    const projById = new Map(projects.map((p) => [p.id, p]));

    // Existing entries with their project / stage.
    const rawEntries = (entriesRes.data ?? []) as Array<{ entry_date: string; hours: number; entry_type: string; internal_category: string | null; leave_type: string | null; task_id: string | null }>;
    const taskIds = [...new Set(rawEntries.map((e) => e.task_id).filter(Boolean) as string[])];
    const taskStage = new Map<string, { stage_id: string; stage: string; project_id: string; project: string }>();
    if (taskIds.length) {
      const { data: tasks } = await db
        .from("pm_tasks")
        .select("id, allocation:pm_allocations(stage:pm_stages(id, name, project:pm_projects(id, name)))")
        .in("id", taskIds);
      for (const t of (tasks ?? []) as unknown as Array<{ id: string; allocation: { stage: { id: string; name: string; project: { id: string; name: string } } } | null }>) {
        const s = t.allocation?.stage;
        if (s) taskStage.set(t.id, { stage_id: s.id, stage: s.name, project_id: s.project.id, project: s.project.name });
      }
    }
    const existing: AssistantExisting[] = rawEntries.map((e) => {
      const ts = e.task_id ? taskStage.get(e.task_id) : undefined;
      const type = (e.entry_type as AssistantExisting["entry_type"]) ?? "project";
      return {
        date: e.entry_date,
        entry_type: type,
        project_id: ts?.project_id ?? null,
        stage_id: ts?.stage_id ?? null,
        internal_category: e.internal_category,
        label: type === "project" ? `${ts?.project ?? "?"} · ${ts?.stage ?? "?"}` : type === "internal" ? (e.internal_category ?? "") : (e.leave_type ?? "leave"),
        hours: Number(e.hours),
      };
    });

    // Prompt context.
    const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
    const ctx = [
      `Today: ${data.today} (${WEEKDAY[dow(data.today)]})`,
      `Target week: ${days.map((d) => `${WEEKDAY[dow(d)]} ${d}`).join(", ")}`,
      `Person's schedule: ${dailyHours} h per day, ${daysPerWeek} days per week (Mon–Fri).`,
      `Leave / public holidays this week (already handled, never create): ${[...leaveByDate].map(([d, l]) => `${d} ${l.label} ${l.hours}h`).join("; ") || "none"}`,
      `Already logged this week: ${existing.filter((e) => e.entry_type !== "non_working").map((e) => `${e.date} ${e.label} ${e.hours}h`).join("; ") || "nothing"}`,
      `Internal categories: ${JSON.stringify(categories)}`,
      `Projects (id | name | client | aliases | stages id:name):`,
      ...projects.map((p) => `${p.id} | ${p.name} | ${p.client ?? ""} | ${(aliasMap.get(p.id) ?? []).join(", ")} | ${p.stages.map((s) => `${s.id}:${s.name}`).join("; ")}`),
    ].join("\n");
    const convo = [
      `What the person said:\n${data.text}`,
      ...(data.answers.length ? ["Answers to your earlier questions:", ...data.answers.map((x) => `Q: ${x.q}\nA: ${x.a}`)] : []),
      ...(data.done ? ["The person says they are done; ask no more questions about missing hours."] : []),
    ].join("\n\n");

    const { claudeText } = await import("@/lib/marketing/nudges.server");
    const out = await claudeText(SYSTEM, [{ type: "text", text: `${ctx}\n\n${convo}` }], 4000);
    const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    let parsed: { entries?: unknown[]; questions?: unknown[] };
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("The assistant returned an unreadable answer. Try again.");
    }

    // Validate everything against the context — never trust unknown ids.
    const catSet = new Set(categories);
    const questions: AssistantQuestion[] = [];
    const entries: AssistantDraft[] = [];
    for (const r of (parsed.entries ?? []) as Array<Record<string, unknown>>) {
      const date = String(r.date ?? "");
      const tm = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v.split(":").map(Number) : null);
      const st = tm(r.start_time), en = tm(r.end_time);
      const fromTimes = st && en ? (en[0] * 60 + en[1] - st[0] * 60 - st[1]) / 60 : 0;
      const hours = Math.round((Number(r.hours) > 0 ? Number(r.hours) : fromTimes) * 4) / 4;
      if (!days.includes(date) || !(hours > 0) || hours > 24) continue;
      const type = r.entry_type === "internal" ? "internal" : "project";
      let project_id = type === "project" && typeof r.project_id === "string" && projById.has(r.project_id) ? r.project_id : null;
      let stage_id: string | null = null;
      let category: string | null = null;
      let confidence: "high" | "low" = r.confidence === "low" ? "low" : "high";
      if (type === "project") {
        const p = project_id ? projById.get(project_id)! : null;
        if (p && typeof r.stage_id === "string" && p.stages.some((s) => s.id === r.stage_id)) stage_id = r.stage_id;
        else if (p && p.stages.length === 1) stage_id = p.stages[0].id;
        if (!p) project_id = null;
        if (!project_id || !stage_id) confidence = "low";
      } else {
        category = typeof r.internal_category === "string" && catSet.has(r.internal_category) ? r.internal_category : null;
        if (!category) confidence = "low";
      }
      const t = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, "0") : null);
      entries.push({
        date,
        start_time: t(r.start_time),
        end_time: t(r.end_time),
        hours,
        entry_type: type,
        project_id,
        stage_id,
        internal_category: category,
        note: String(r.note ?? "").slice(0, 300),
        confidence,
      });
    }
    for (const q of (parsed.questions ?? []) as Array<Record<string, unknown>>) {
      if (questions.length >= 4) break;
      const text = String(q.text ?? "").trim();
      if (!text) continue;
      const options = Array.isArray(q.options) ? q.options.map((o) => String(o).slice(0, 120)).filter(Boolean).slice(0, 6) : [];
      questions.push({ text: text.slice(0, 400), options });
    }

    return { weekStart, weekEnd, locked, dailyHours, projects, categories, existing, entries, questions };
  });
