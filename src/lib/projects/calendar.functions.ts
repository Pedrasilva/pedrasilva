/**
 * Google Calendar connection — always for the signed-in caller (context.userId).
 * No function here accepts a user id.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CalendarStatus = { connected: boolean; email: string | null };

export const getCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CalendarStatus> => {
    const { getConnection } = await import("./calendar.server");
    const c = await getConnection(context.userId);
    return { connected: !!c, email: c?.google_email ?? null };
  });

export const getCalendarConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ origin: z.string().url(), returnTo: z.string().max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { signState, authUrl, checkOrigin } = await import("./calendar.server");
    const origin = checkOrigin(data.origin);
    return { url: authUrl(origin, await signState(context.userId, origin, data.returnTo)) };
  });

export const disconnectCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnect } = await import("./calendar.server");
    return disconnect(context.userId);
  });

/**
 * Calendar suggestions for the timesheet grid — the caller's own calendar only.
 * Ranking (no AI) lives in calendar-match.server.ts and is shared with the
 * assistant. Returns only title/time and the matches — never descriptions,
 * locations or attendee addresses.
 */
export type GridSuggestion = import("./calendar-match.server").EventSuggestion;
export type GridCalendarEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  /** Top match when it is certain (only match, or remembered for the series) — drives row hints. */
  project_id: string | null;
  lead_id: string | null;
  suggestions: GridSuggestion[];
  series_id: string | null;
  match_word: string | null;
};
export type GridCalendar = { status: "not_connected" | "expired" | "connected"; events: GridCalendarEvent[] };

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type RawStage = { id: string; name: string; start_date: string; end_date: string; sort_order: number; parent_stage_id: string | null; is_self: boolean | null; status: string | null; stage_kind: string | null };
/** Active projects with only the stages that take new hours (same rule as the assistant). */
export function toMatchProjects(
  rows: Array<{ id: string; name: string; client: string | null; company_id: string | null; stages: RawStage[] | null }>,
  aliases: Map<string, string[]>,
) {
  return rows.map((p) => {
    const raw = p.stages ?? [];
    const parents = new Set(raw.map((s) => s.parent_stage_id).filter(Boolean) as string[]);
    const retainerParents = new Set(raw.filter((s) => s.stage_kind === "retainer_monthly").map((s) => s.id));
    return {
      id: p.id,
      name: p.name,
      client: p.client,
      company_id: p.company_id,
      aliases: aliases.get(p.id) ?? [],
      stages: raw
        .filter((s) => !parents.has(s.id) && s.is_self !== false)
        .filter((s) => s.status === "active" || (!!s.parent_stage_id && retainerParents.has(s.parent_stage_id)))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ id, name, start_date, end_date }) => ({ id, name, start_date, end_date })),
    };
  });
}

export const getCalendarGridSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ weekStart: ISO, weekEnd: ISO }).parse(i))
  .handler(async ({ data, context }): Promise<GridCalendar> => {
    const userId = context.userId;
    const cal = await import("./calendar.server");
    const conn = await cal.getConnection(userId);
    if (!conn) return { status: "not_connected", events: [] };
    let all: import("./calendar.server").CalendarEvent[];
    try {
      all = (await cal.weekEvents(userId, data.weekStart, data.weekEnd)) ?? [];
    } catch (e) {
      if (e instanceof cal.CalendarExpiredError) return { status: "expired", events: [] };
      throw e;
    }
    const db = context.supabase;
    const [entRes, disRes, projRes, aliasRes, leadRes] = await Promise.all([
      db.from("pm_time_entries").select("calendar_event_ids").eq("user_id", userId).gte("entry_date", data.weekStart).lte("entry_date", data.weekEnd),
      db.from("calendar_dismissed_events").select("event_id").eq("user_id", userId),
      db
        .from("pm_projects")
        .select("id, name, client, company_id, stages:pm_stages(id, name, start_date, end_date, sort_order, parent_stage_id, is_self, status, stage_kind)")
        .eq("status", "active")
        .limit(400),
      db.from("marketing_project_profiles").select("project_id, aliases"),
      db.rpc("crm_leads_directory"),
    ]);
    const saved = new Set(((entRes.data ?? []) as Array<{ calendar_event_ids: string[] | null }>).flatMap((e) => e.calendar_event_ids ?? []));
    const dismissed = new Set(((disRes.data ?? []) as Array<{ event_id: string }>).map((d) => d.event_id));
    const events = all.filter((e) => !saved.has(e.id) && !dismissed.has(e.id));
    if (!events.length) return { status: "connected", events: [] };

    const aliases = new Map<string, string[]>();
    for (const a of (aliasRes.data ?? []) as Array<{ project_id: string; aliases: string[] | null }>) if (a.aliases?.length) aliases.set(a.project_id, a.aliases);
    const projects = toMatchProjects((projRes.data ?? []) as never, aliases);
    const leads = ((leadRes.data ?? []) as Array<{ id: string; name: string; company_name: string | null; is_open: boolean }>)
      .filter((l) => l.is_open)
      .map((l) => ({ id: l.id, name: l.name, client: l.company_name }));

    // Attendee emails → contacts → companies.
    const emails = [...new Set(events.flatMap((e) => e.attendees).filter((m) => !m.endsWith("@pedrasilva.com")))];
    const companyOfEmail = new Map<string, string>();
    if (emails.length) {
      const { data: cs } = await db.from("contacts").select("email, company_id").in("email", emails.slice(0, 300));
      for (const c of (cs ?? []) as Array<{ email: string | null; company_id: string | null }>)
        if (c.email && c.company_id) companyOfEmail.set(c.email.toLowerCase(), c.company_id);
    }

    const { buildMatcher } = await import("./calendar-match.server");
    const matcher = await buildMatcher(db as never, userId, projects, leads);
    const out: GridCalendarEvent[] = events.map((e) => {
      const r = matcher.rank(e, companyOfEmail);
      const top = r.suggestions[0]?.preselect ? r.suggestions[0] : null;
      return {
        id: e.id, title: e.title, date: e.date, start: e.start, end: e.end, minutes: e.minutes,
        project_id: top?.project_id ?? null,
        lead_id: top?.lead_id ?? null,
        suggestions: r.suggestions,
        series_id: e.series_id,
        match_word: r.match_word,
      };
    });
    return { status: "connected", events: out };
  });

/** Remember what the caller chose for an event (series id and/or one word). */
export const rememberCalendarMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        series_id: z.string().max(300).nullable(),
        word: z.string().regex(/^[a-z]{4,40}$/).nullable(),
        project_id: z.string().uuid().nullable(),
        stage_id: z.string().uuid().nullable(),
        opportunity_id: z.string().uuid().nullable(),
        internal_category: z.string().max(100).nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const keys: Array<{ key_type: "series" | "word"; key: string }> = [];
    if (data.series_id) keys.push({ key_type: "series", key: data.series_id });
    if (data.word) keys.push({ key_type: "word", key: data.word });
    if (!keys.length) return { ok: true };
    const { rememberChoice } = await import("./calendar-match.server");
    await rememberChoice(context.supabase as never, context.userId, keys, {
      project_id: data.project_id, stage_id: data.stage_id, opportunity_id: data.opportunity_id, internal_category: data.internal_category,
    });
    return { ok: true };
  });

export const getCalendarMemoryCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase.from("calendar_match_memory").select("id", { count: "exact", head: true }).eq("user_id", context.userId);
    return { count: count ?? 0 };
  });

export const clearCalendarMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("calendar_match_memory").delete().eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
