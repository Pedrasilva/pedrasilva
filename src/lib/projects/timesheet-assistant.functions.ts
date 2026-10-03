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
  /** Stable id within one run, referenced by questions' draft_ids. */
  id: string;
  /** Exact phrase from the dictation this draft came from (validated substring), if any. */
  quote: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  entry_type: "project" | "internal";
  project_id: string | null;
  stage_id: string | null;
  internal_category: string | null;
  /** Pursuit drafts only (internal_category = "Pursuit"): the open CRM lead. */
  opportunity_id: string | null;
  note: string;
  confidence: "high" | "low";
  /** Google Calendar event this draft comes from, if any. */
  event_id: string | null;
};
export type AssistantCalendar = { status: "off" | "not_connected" | "connected" | "expired"; email: string | null; events: number };
export type AssistantQuestion = {
  text: string;
  options: string[];
  source: "calendar" | "dictation" | "hours";
  draft_ids: string[];
  event_ids: string[];
  /** Built from our own data (events, transcript, day totals), never the model's wording. */
  context: string;
};
export type AssistantSkipReason = "outside_week" | "no_hours" | "over_24h" | "bad_date";
export type AssistantSkipped = { quote: string | null; date: string | null; reason: AssistantSkipReason };
export type AssistantResult = {
  weekStart: string;
  weekEnd: string;
  locked: boolean;
  dailyHours: number;
  projects: AssistantProject[];
  categories: string[];
  /** Open CRM leads (names only) the person can log Pursuit time against. */
  leads: { id: string; name: string; client: string | null }[];
  existing: AssistantExisting[];
  entries: AssistantDraft[];
  questions: AssistantQuestion[];
  calendar: AssistantCalendar;
  /** Entries the model returned that failed validation — never dropped silently. */
  skipped: AssistantSkipped[];
  /** Monday of the single other week every out-of-week entry belongs to, if any. */
  otherWeek: string | null;
  /** Notes for days that already had hours logged, e.g. "Segunda já tem 6 h registadas; com estas fica com 14 h." */
  dayNotes: string[];
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
{"entries":[{"ref":"d1","quote":string|null,"date":"YYYY-MM-DD","start_time":"HH:MM"|null,"end_time":"HH:MM"|null,"hours":number,"entry_type":"project"|"internal","project_id":string|null,"stage_id":string|null,"internal_category":string|null,"opportunity_id":string|null,"note":string,"confidence":"high"|"low","event_id":string|null}],
 "questions":[{"text":string,"options":[string],"source":"calendar"|"dictation"|"hours","draft_ids":[string],"event_ids":[string],"date":"YYYY-MM-DD"|null}]}
Rules:
- Every entry gets a unique ref ("d1","d2",...). quote = the exact, verbatim span of the person's text that this entry comes from (copy characters exactly, no paraphrase), or null for calendar-only drafts.
- Every question MUST say what it is about: source "calendar" when it is about calendar events (list them in event_ids, and the drafts made from them in draft_ids), "dictation" when about dictated items (draft_ids of those entries), "hours" when about a day's total (date = that day, draft_ids/event_ids may be empty).
- Options must be exact names from the lists (project names, stage names of the referenced project, category names, lead names) or exactly "That's all", "Add it", "No". Nothing else. Do not add a "don't log" or "other" option; the app adds those.
- Leads as candidates: when an item doesn't clearly match a project, also consider the open leads; offer matching lead names as options next to project names.
- An answer "Don't log" / "Não registar" means: create no entry for that item and don't ask about it again.
- Create one entry for EVERY activity the person mentions (meetings included), even if something similar is already logged; saving adds to existing hours. "Already logged" only counts towards day totals.
- Write questions in the language of the person's own text (English text → English questions).
- Dates must fall inside the target week given. Resolve "Monday", "yesterday", "on the 24th", "segunda", "ontem" against today's date and the week dates.
- hours: from start/end when given, otherwise as said. Round to 0.25.
- "o resto do tempo", "o resto do dia", "the rest of the day", "the rest of the time" mean the person's daily hours for that day, minus approved leave or public holiday that day, minus the OTHER activities mentioned for that same day in this text. Do NOT subtract hours already logged before. Example (8 h day): "uma hora de reunião e o resto do dia a fazer propostas de honorários" → 1 h Meetings + 7 h Fee proposals. Put that number in hours, and do not ask about it unless it is 0 or less.
- Always use the real calendar dates the person means, even when they fall outside the target week (e.g. "semana passada", "last Monday"). Never move an activity into the target week.
- entry_type "project" needs a project_id from the projects list; pick stage_id from THAT project's stages. If the project has exactly one stage use it. If the stage is unclear, set stage_id null, confidence "low", and ask which stage (options = stage names).
- entry_type "internal" needs internal_category copied EXACTLY from the categories list (meetings, training, admin, etc. map to the closest category). If no category clearly fits, set internal_category null and confidence "low" — never invent one. project_id and stage_id must be null.
- Pursuit: time spent on an open CRM lead (a proposal, competition, pitch or client not yet a project) is entry_type "internal", internal_category "Pursuit" and opportunity_id = the lead's id from the leads list. opportunity_id is null for every other entry. If a lead and a project both match, or two leads match, set confidence "low" and ask (options = names). Never use "Pursuit" without an opportunity_id.
- Match projects by name, client, number or alias, tolerating misspellings and accents. NEVER invent a project, stage or category not in the lists. If nothing matches or two are plausible, still add the entry with project_id null (or your best guess with confidence "low") and ask, with the candidate names as options.
- note: a short note in the person's own words and language (e.g. "layouts and test fits"). No times in the note.
- confidence "low" whenever you guessed anything.
- Never create leave, vacation or holiday entries; those come from HR.
- questions: one per real ambiguity (two possible projects, which stage, unclear day, hours that don't add up). Also, for each working day mentioned whose total (already logged + leave + new entries) is below the person's daily hours, ask e.g. "That's 7 of your 8 hours on Monday. Anything else?" with options like ["That's all"]. Write questions in the language the person used. Max 4 questions. Options are short answers the person can tap (project names, stage names, "That's all"); may be empty.
- Calendar events (when listed): each has an id. Never invent event ids.
  * With no dictated text, create one draft per listed event (event_id = its id, date/start/end from the event, hours from its times) matched to a project via title, location, aliases or the attendee companies' projects, or to an internal category when it sounds internal (team meeting, training, admin). If the match is ambiguous, set project_id null / confidence "low" and ask, never guess.
  * With dictated text: if a dictated item matches an event, use the event's times and set event_id. If they conflict (different time or length), keep the dictated version without event_id and ask which is right. For each event on a day the person talked about that their text doesn't cover, don't create it; ask e.g. "You had 'Restelo site visit' at 15:00. Add it?" with options ["Add it","No"]. If they answer yes, create it with its event_id.
  * Never create two drafts for the same event_id. Events count towards questions' max of 4 only when ambiguous.
- If the person answered previous questions, apply the answers and don't ask them again. If they said they're done / "é tudo" / "that's all", ask no more questions about missing hours.`;

export const parseTimesheetDictation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().trim().max(6000).default(""),
        useCalendar: z.boolean().default(false),
        weekStart: iso,
        today: iso,
        answers: z.array(z.object({ q: z.string().max(500), a: z.string().max(1000) })).max(20).default([]),
        done: z.boolean().default(false),
        lang: z.enum(["pt", "en"]).default("pt"),
      })
      .refine((x) => x.text.length > 0 || x.useCalendar, "Say or type what you worked on.")
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AssistantResult> => {
    const db = context.supabase;
    const userId = context.userId;
    const weekStart = data.weekStart;
    const weekEnd = addDaysISO(weekStart, 6);
    if (dow(weekStart) !== 1) throw new Error("weekStart must be a Monday");

    const [{ data: collabId }, weekRow, entriesRes, holRes, catRes, leadRes, projRes, aliasRes] = await Promise.all([
      db.rpc("get_my_collaborator_id"),
      db.from("pm_timesheet_weeks").select("status").eq("user_id", userId).eq("week_start", weekStart).maybeSingle(),
      db
        .from("pm_time_entries")
        .select("entry_date, hours, entry_type, internal_category, leave_type, task_id, calendar_event_ids")
        .eq("user_id", userId)
        .gte("entry_date", weekStart)
        .lte("entry_date", weekEnd),
      db.from("holidays").select("data, nome").gte("data", weekStart).lte("data", weekEnd),
      db.from("pm_internal_categories").select("name, visible_to_profiles").is("archived_at", null).order("sort_order"),
      db.rpc("crm_leads_directory"),
      db
        .from("pm_projects")
        .select("id, name, client, company_id, stages:pm_stages(id, name, start_date, end_date, sort_order, parent_stage_id, is_self)")
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
      .map((c) => c.name)
      .filter((n) => n !== "Pursuit");
    const leads = ((leadRes.data ?? []) as Array<{ id: string; name: string; company_name: string | null; is_open: boolean }>)
      .filter((l) => l.is_open)
      .map((l) => ({ id: l.id, name: l.name, client: l.company_name }));
    const leadIds = new Set(leads.map((l) => l.id));

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
    const rawEntries = (entriesRes.data ?? []) as Array<{ entry_date: string; hours: number; entry_type: string; internal_category: string | null; leave_type: string | null; task_id: string | null; calendar_event_ids: string[] | null }>;
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

    // Google Calendar — always the caller's own (context.userId). Event data is
    // used for this request only and never stored.
    const calendar: AssistantCalendar = { status: "off", email: null, events: 0 };
    let events: import("./calendar.server").CalendarEvent[] = [];
    if (data.useCalendar) {
      const cal = await import("./calendar.server");
      const conn = await cal.getConnection(userId);
      calendar.status = conn ? "connected" : "not_connected";
      calendar.email = conn?.google_email ?? null;
      if (conn) {
        try {
          const all = (await cal.weekEvents(userId, weekStart, weekEnd)) ?? [];
          const saved = new Set(rawEntries.flatMap((e) => e.calendar_event_ids ?? []));
          const { data: dis } = await db.from("calendar_dismissed_events").select("event_id").eq("user_id", userId);
          const dismissed = new Set((dis ?? []).map((d) => d.event_id));
          events = all.filter((e) => !saved.has(e.id) && !dismissed.has(e.id));
          calendar.events = events.length;
        } catch (e) {
          if (e instanceof cal.CalendarExpiredError) calendar.status = "expired";
          else throw e;
        }
      }
    }
    if (!data.text && !events.length) {
      return { weekStart, weekEnd, locked, dailyHours, projects, categories, leads, existing, entries: [], questions: [], calendar, skipped: [], otherWeek: null };
    }
    // Attendee emails → CRM contacts → company → that company's projects (sent as names only).
    const companyOfEmail = new Map<string, string>();
    const companyName = new Map<string, string>();
    const emails = [...new Set(events.flatMap((e) => e.attendees).filter((m) => !m.endsWith("@pedrasilva.com")))];
    if (emails.length) {
      const { data: cs } = await db.from("contacts").select("email, company_id").in("email", emails.slice(0, 300));
      for (const c of (cs ?? []) as Array<{ email: string | null; company_id: string | null }>) if (c.email && c.company_id) companyOfEmail.set(c.email.toLowerCase(), c.company_id);
      const ids = [...new Set(companyOfEmail.values())];
      if (ids.length) {
        const { data: co } = await db.from("companies").select("id, nome").in("id", ids);
        for (const c of (co ?? []) as Array<{ id: string; nome: string }>) companyName.set(c.id, c.nome);
      }
    }
    const projByCompany = new Map<string, string[]>();
    for (const p of (projRes.data ?? []) as Array<{ id: string; name: string; company_id: string | null }>) {
      if (p.company_id) projByCompany.set(p.company_id, [...(projByCompany.get(p.company_id) ?? []), p.name]);
    }
    const eventLine = (e: (typeof events)[number]) => {
      const internal = e.attendees.filter((m) => m.endsWith("@pedrasilva.com")).length;
      const cos = [...new Set(e.attendees.map((m) => companyOfEmail.get(m)).filter(Boolean) as string[])];
      const other = e.attendees.length - internal - e.attendees.filter((m) => companyOfEmail.has(m)).length;
      const coTxt = cos.map((c) => `${companyName.get(c) ?? "?"} (projects: ${(projByCompany.get(c) ?? []).join(", ") || "none"})`).join("; ");
      return `${e.id} | ${WEEKDAY[dow(e.date)]} ${e.date} ${e.start}–${e.end} | title: ${JSON.stringify(e.title)} | location: ${e.location ? JSON.stringify(e.location) : "none"} | attendees: ${internal} colleague(s)${coTxt ? `, client companies: ${coTxt}` : ""}${other > 0 ? `, ${other} unknown external` : ""}`;
    };

    // Prompt context.
    const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
    const ctx = [
      `Today: ${data.today} (${WEEKDAY[dow(data.today)]})`,
      `Target week: ${days.map((d) => `${WEEKDAY[dow(d)]} ${d}`).join(", ")}`,
      `Person's schedule: ${dailyHours} h per day, ${daysPerWeek} days per week (Mon–Fri).`,
      `Leave / public holidays this week (already handled, never create): ${[...leaveByDate].map(([d, l]) => `${d} ${l.label} ${l.hours}h`).join("; ") || "none"}`,
      `Already logged this week: ${existing.filter((e) => e.entry_type !== "non_working").map((e) => `${e.date} ${e.label} ${e.hours}h`).join("; ") || "nothing"}`,
      `Internal categories: ${JSON.stringify(categories)}`,
      `Open CRM leads for Pursuit (id | name | client): ${leads.length ? "" : "none"}`,
      ...leads.map((l) => `${l.id} | ${l.name} | ${l.client ?? ""}`),
      `Projects (id | name | client | aliases | stages id:name):`,
      ...projects.map((p) => `${p.id} | ${p.name} | ${p.client ?? ""} | ${(aliasMap.get(p.id) ?? []).join(", ")} | ${p.stages.map((s) => `${s.id}:${s.name}`).join("; ")}`),
      ...(events.length ? [`Calendar events not yet logged (event id | when | title | location | attendees):`, ...events.map(eventLine)] : []),
    ].join("\n");
    const convo = [
      data.text ? `What the person said:\n${data.text}` : "The person said nothing yet: draft the calendar events.",
      ...(data.answers.length ? ["Answers to your earlier questions:", ...data.answers.map((x) => `Q: ${x.q}\nA: ${x.a}`)] : []),
      ...(data.done ? ["The person says they are done; ask no more questions about missing hours."] : []),
    ].join("\n\n");

    const { claudeText } = await import("@/lib/marketing/nudges.server");
    const out = await claudeText(SYSTEM, [{ type: "text", text: `${ctx}\n\n${convo}` }], 4000);
    const evById = new Map(events.map((e) => [e.id, e]));
    const usedEvents = new Set<string>();
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
    const refMap = new Map<string, string>();
    const lowerText = data.text.toLowerCase();
    let seq = 0;
    const skipped: AssistantSkipped[] = [];
    const restPending: Array<{ r: Record<string, unknown>; date: string; event_id: string | null }> = [];
    const REST = /\b(o\s+)?resto\s+do\s+(tempo|dia)\b|\brest\s+of\s+(the\s+|my\s+)?(day|time)\b/i;
    const quoteOf = (r: Record<string, unknown>) => {
      const qRaw = typeof r.quote === "string" ? r.quote.trim() : "";
      const qi = qRaw ? lowerText.indexOf(qRaw.toLowerCase()) : -1;
      return qi >= 0 ? data.text.slice(qi, qi + qRaw.length).slice(0, 300) : qRaw ? qRaw.slice(0, 300) : null;
    };
    const rawList = (parsed.entries ?? []) as Array<Record<string, unknown>>;
    const pushEntry = (r: Record<string, unknown>, date: string, hours: number, event_id: string | null) => {
      const type = r.entry_type === "internal" ? "internal" : "project";
      let project_id = type === "project" && typeof r.project_id === "string" && projById.has(r.project_id) ? r.project_id : null;
      let stage_id: string | null = null;
      let category: string | null = null;
      let opportunity_id: string | null = null;
      let confidence: "high" | "low" = r.confidence === "low" ? "low" : "high";
      if (type === "project") {
        const p = project_id ? projById.get(project_id)! : null;
        if (p && typeof r.stage_id === "string" && p.stages.some((s) => s.id === r.stage_id)) stage_id = r.stage_id;
        else if (p && p.stages.length === 1) stage_id = p.stages[0].id;
        if (!p) project_id = null;
        if (!project_id || !stage_id) confidence = "low";
      } else {
        category = typeof r.internal_category === "string" && catSet.has(r.internal_category) ? r.internal_category : null;
        if (typeof r.opportunity_id === "string" && leadIds.has(r.opportunity_id)) {
          category = "Pursuit";
          opportunity_id = r.opportunity_id;
        }
        if (!category) confidence = "low";
      }
      const t = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, "0") : null);
      const id = `d${++seq}`;
      if (typeof r.ref === "string" && !refMap.has(r.ref)) refMap.set(r.ref, id);
      const qRaw = typeof r.quote === "string" ? r.quote.trim() : "";
      const qi = qRaw ? lowerText.indexOf(qRaw.toLowerCase()) : -1;
      entries.push({
        id,
        quote: qi >= 0 ? data.text.slice(qi, qi + qRaw.length).slice(0, 300) : null,
        date,
        start_time: t(r.start_time),
        end_time: t(r.end_time),
        hours,
        entry_type: type,
        project_id,
        stage_id,
        internal_category: category,
        opportunity_id,
        note: String(r.note ?? "").slice(0, 300),
        confidence,
        event_id,
      });
      return id;
    };
    for (const r of rawList) {
      let event_id = typeof r.event_id === "string" && evById.has(r.event_id) && !usedEvents.has(r.event_id) ? r.event_id : null;
      if (event_id) {
        const ev = evById.get(event_id)!;
        Object.assign(r, { date: ev.date, start_time: ev.start, end_time: ev.end, hours: Math.round((ev.minutes / 60) * 4) / 4 });
        usedEvents.add(event_id);
      } else event_id = null;
      const date = String(r.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + "T00:00:00Z").getTime()) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
        skipped.push({ quote: quoteOf(r), date: date || null, reason: "bad_date" });
        continue;
      }
      if (!days.includes(date)) {
        skipped.push({ quote: quoteOf(r), date, reason: "outside_week" });
        continue;
      }
      const tm = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v.split(":").map(Number) : null);
      const st = tm(r.start_time), en = tm(r.end_time);
      const fromTimes = st && en ? (en[0] * 60 + en[1] - st[0] * 60 - st[1]) / 60 : 0;
      const hours = Math.round((Number(r.hours) > 0 ? Number(r.hours) : fromTimes) * 4) / 4;
      if (!(hours > 0)) {
        const q = quoteOf(r) ?? "";
        if (!st && !en && REST.test(q) && !event_id) restPending.push({ r, date, event_id });
        else skipped.push({ quote: quoteOf(r), date, reason: "no_hours" });
        continue;
      }
      if (hours > 24) {
        skipped.push({ quote: quoteOf(r), date, reason: "over_24h" });
        continue;
      }
      pushEntry(r, date, hours, event_id);
    }
    // "The rest of the day": daily hours minus leave/holiday minus the other new entries that day (already-logged hours are NOT subtracted).
    const dayTotal = (d: string) =>
      (leaveByDate.get(d)?.hours ?? 0)
      + entries.filter((e) => e.date === d).reduce((s2, e) => s2 + e.hours, 0);
    const restQuestions: AssistantQuestion[] = [];
    for (const p of restPending) {
      const others = restPending.filter((x) => x.date === p.date).length;
      const rem = Math.floor(((dailyHours - dayTotal(p.date)) / others) * 4) / 4;
      if (rem > 0) {
        pushEntry(p.r, p.date, rem, null);
      } else {
        const q = quoteOf(p.r);
        const n = new Date(p.date + "T00:00:00Z").getUTCDay();
        const DAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
        restQuestions.push({
          text: data.lang === "pt"
            ? `${DAYS_PT[n][0].toUpperCase() + DAYS_PT[n].slice(1)} já tem ${dayTotal(p.date)} de ${dailyHours} h. Quantas horas para «${q ?? ""}»?`
            : `${WEEKDAY[n]} already has ${dayTotal(p.date)} of ${dailyHours} h. How many hours for "${q ?? ""}"?`,
          options: [],
          source: "dictation",
          draft_ids: [],
          event_ids: [],
          context: q ? `«${q}»` : "",
        });
      }
    }
    const outWeeks = new Set(skipped.filter((x) => x.reason === "outside_week" && x.date).map((x) => addDaysISO(x.date!, -((dow(x.date!) + 6) % 7))));
    const outCount = skipped.filter((x) => x.reason === "outside_week").length;
    const otherWeek = outCount > 0 && outWeeks.size === 1 && entries.length === 0 && restPending.length === 0 ? [...outWeeks][0] : null;
    const byReason = skipped.reduce<Record<string, number>>((m, x) => ({ ...m, [x.reason]: (m[x.reason] ?? 0) + 1 }), {});
    console.log("[timesheet-assistant] counts", JSON.stringify({ returned: rawList.length, kept: entries.length, rest: restPending.length, skipped: byReason }));
    const pt = data.lang === "pt";
    const DOW_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const DAY_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const MON_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const shortDate = (d: string) => {
      const x = new Date(d + "T00:00:00Z");
      return pt ? `${DOW_PT[x.getUTCDay()]} ${x.getUTCDate()} ${MON_PT[x.getUTCMonth()]}` : `${DOW_EN[x.getUTCDay()]} ${x.getUTCDate()} ${MON_EN[x.getUTCMonth()]}`;
    };
    const entryById = new Map(entries.map((e) => [e.id, e]));
    const leadSuffix = pt ? " · proposta" : " · proposal";
    const fixed = ["That's all", "Add it", "No", "É tudo", "Adicionar", "Não"];
    const norm = (x: string) => x.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const q of (parsed.questions ?? []) as Array<Record<string, unknown>>) {
      if (questions.length >= 4) break;
      const text = String(q.text ?? "").trim();
      if (!text) continue;
      const draft_ids = [...new Set((Array.isArray(q.draft_ids) ? q.draft_ids : []).map((x) => refMap.get(String(x))).filter(Boolean) as string[])];
      const event_ids = [...new Set((Array.isArray(q.event_ids) ? q.event_ids : []).map(String).filter((x) => evById.has(x)))];
      // Events linked through drafts count too.
      for (const id of draft_ids) { const ev = entryById.get(id)?.event_id; if (ev && !event_ids.includes(ev)) event_ids.push(ev); }
      let source: AssistantQuestion["source"] = q.source === "calendar" || q.source === "hours" ? q.source : "dictation";
      if (event_ids.length && source === "dictation" && !draft_ids.some((id) => entryById.get(id)?.quote)) source = "calendar";
      // Context from our own data.
      let context = "";
      if (source === "calendar" && event_ids.length) {
        context = event_ids.map((id) => { const e = evById.get(id)!; return `📅 ${pt ? "Calendário" : "Calendar"} · ${shortDate(e.date)}, ${e.start}–${e.end} · «${e.title}»`; }).join("\n");
      } else if (source === "hours") {
        const d = typeof q.date === "string" && days.includes(q.date) ? q.date : draft_ids.map((id) => entryById.get(id)?.date).find(Boolean) ?? null;
        if (d) {
          const total = existing.filter((e) => e.date === d && e.entry_type !== "non_working").reduce((s, e) => s + e.hours, 0)
            + (leaveByDate.get(d)?.hours ?? 0)
            + entries.filter((e) => e.date === d).reduce((s, e) => s + e.hours, 0);
          const n = new Date(d + "T00:00:00Z").getUTCDay();
          context = pt ? `${DAY_PT[n]}: ${total} de ${dailyHours} h` : `${WEEKDAY[n]}: ${total} of ${dailyHours} h`;
        }
      } else {
        const quotes = [...new Set(draft_ids.map((id) => entryById.get(id)?.quote).filter(Boolean) as string[])];
        context = quotes.map((x) => `«${x}»`).join("\n");
        if (!context && event_ids.length) context = event_ids.map((id) => { const e = evById.get(id)!; return `📅 ${pt ? "Calendário" : "Calendar"} · ${shortDate(e.date)}, ${e.start}–${e.end} · «${e.title}»`; }).join("\n");
      }
      // Only real answers.
      const refProjects = draft_ids.map((id) => entryById.get(id)?.project_id).filter(Boolean) as string[];
      const stagePool = (refProjects.length ? refProjects.map((id) => projById.get(id)!) : []).flatMap((p) => p.stages.map((s) => s.name));
      const allowed = new Map<string, string>();
      for (const p of projects) allowed.set(norm(p.name), p.name);
      for (const s2 of stagePool) allowed.set(norm(s2), s2);
      for (const c of categories) allowed.set(norm(c), c);
      for (const l of leads) { allowed.set(norm(l.name), l.name + leadSuffix); allowed.set(norm(l.name + leadSuffix), l.name + leadSuffix); }
      for (const f of fixed) allowed.set(norm(f), f);
      const options = [...new Set((Array.isArray(q.options) ? q.options : []).map((o) => allowed.get(norm(String(o)))).filter(Boolean) as string[])].slice(0, 6);
      questions.push({ text: text.slice(0, 400), options, source, draft_ids, event_ids, context });
    }

    // Internal drafts without a category: ask, with the real categories as options.
    const covered = new Set(questions.flatMap((q) => q.draft_ids));
    for (const e of entries) {
      if (e.entry_type !== "internal" || e.internal_category || covered.has(e.id)) continue;
      const label = e.quote ?? e.note;
      questions.push({
        text: pt ? `Que categoria para «${label}»?` : `Which category for "${label}"?`,
        options: categories.slice(0, 12),
        source: "dictation",
        draft_ids: [e.id],
        event_ids: [],
        context: e.quote ? `«${e.quote}» · ${shortDate(e.date)}` : shortDate(e.date),
      });
    }
    questions.push(...restQuestions);

    // One note per day that already has hours logged.
    const dayNotes: string[] = [];
    for (const d of [...new Set(entries.map((e) => e.date))].sort()) {
      const logged = existing.filter((e) => e.date === d && e.entry_type !== "non_working").reduce((s2, e) => s2 + e.hours, 0);
      if (!(logged > 0)) continue;
      const total = logged + entries.filter((e) => e.date === d).reduce((s2, e) => s2 + e.hours, 0);
      const n = new Date(d + "T00:00:00Z").getUTCDay();
      const fmt = (x: number) => String(Math.round(x * 100) / 100).replace(".", pt ? "," : ".");
      dayNotes.push(pt ? `${DAY_PT[n]} já tem ${fmt(logged)} h registadas; com estas fica com ${fmt(total)} h.` : `${WEEKDAY[n]} already has ${fmt(logged)} h logged; with these it will have ${fmt(total)} h.`);
    }

    return { weekStart, weekEnd, locked, dailyHours, projects, categories, leads, existing, entries, questions, calendar, skipped, otherWeek, dayNotes };
  });
