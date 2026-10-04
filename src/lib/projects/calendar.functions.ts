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
 * Fixed matching rules (no AI): attendee email → CRM contact → company → its
 * active projects, or the project's number/name/alias in the title; leads by
 * name in the title or by the attendee's company. Returns only title/time and
 * the match — never descriptions, locations or attendee addresses.
 */
export type GridCalendarEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  project_id: string | null;
  lead_id: string | null;
};
export type GridCalendar = { status: "not_connected" | "expired" | "connected"; events: GridCalendarEvent[] };

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const normT = (x: string) =>
  ` ${x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

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
      db.from("pm_projects").select("id, name, company_id").eq("status", "active"),
      db.from("marketing_project_profiles").select("project_id, aliases"),
      db.rpc("crm_leads_directory"),
    ]);
    const saved = new Set(((entRes.data ?? []) as Array<{ calendar_event_ids: string[] | null }>).flatMap((e) => e.calendar_event_ids ?? []));
    const dismissed = new Set(((disRes.data ?? []) as Array<{ event_id: string }>).map((d) => d.event_id));
    const events = all.filter((e) => !saved.has(e.id) && !dismissed.has(e.id));
    if (!events.length) return { status: "connected", events: [] };

    const projects = (projRes.data ?? []) as Array<{ id: string; name: string; company_id: string | null }>;
    const aliases = new Map<string, string[]>();
    for (const a of (aliasRes.data ?? []) as Array<{ project_id: string; aliases: string[] | null }>) if (a.aliases?.length) aliases.set(a.project_id, a.aliases);
    const leads = ((leadRes.data ?? []) as Array<{ id: string; name: string; company_name: string | null; is_open: boolean }>).filter((l) => l.is_open);

    // Attendee emails → contacts → companies.
    const emails = [...new Set(events.flatMap((e) => e.attendees).filter((m) => !m.endsWith("@pedrasilva.com")))];
    const companyOfEmail = new Map<string, string>();
    const companyName = new Map<string, string>();
    if (emails.length) {
      const { data: cs } = await db.from("contacts").select("email, company_id").in("email", emails.slice(0, 300));
      for (const c of (cs ?? []) as Array<{ email: string | null; company_id: string | null }>)
        if (c.email && c.company_id) companyOfEmail.set(c.email.toLowerCase(), c.company_id);
      const ids = [...new Set(companyOfEmail.values())];
      if (ids.length) {
        const { data: cos } = await db.from("companies").select("id, nome").in("id", ids);
        for (const c of (cos ?? []) as Array<{ id: string; nome: string }>) companyName.set(c.id, normT(c.nome));
      }
    }

    const projKeys = projects.map((p) => {
      const n = normT(p.name);
      const first = n.trim().split(" ")[0] ?? "";
      const number = /^\d{3,5}[a-z]?$/.test(first) ? first : null;
      const rest = number ? ` ${n.trim().split(" ").slice(1).join(" ")} ` : n;
      const phrases = [rest, ...(aliases.get(p.id) ?? []).map(normT)].filter((x) => x.trim().length >= 4);
      return { id: p.id, company: p.company_id, number, phrases };
    });

    const out: GridCalendarEvent[] = events.map((e) => {
      const title = normT(e.title);
      const titleHits = projKeys.filter((p) => (p.number && title.includes(` ${p.number} `)) || p.phrases.some((ph) => title.includes(ph)));
      const cos = new Set(e.attendees.map((m) => companyOfEmail.get(m)).filter(Boolean) as string[]);
      const coHits = projKeys.filter((p) => p.company && cos.has(p.company));
      const hits = titleHits.length ? titleHits : coHits;
      let project_id = hits.length === 1 ? hits[0].id : null;
      let lead_id: string | null = null;
      if (!project_id && hits.length === 0) {
        const coNames = new Set([...cos].map((c) => companyName.get(c)).filter(Boolean) as string[]);
        const lh = leads.filter((l) => {
          const ln = normT(l.name);
          return (ln.trim().length >= 4 && title.includes(ln)) || (!!l.company_name && coNames.has(normT(l.company_name)));
        });
        if (lh.length === 1) lead_id = lh[0].id;
      }
      if (hits.length > 1) project_id = null;
      return { id: e.id, title: e.title, date: e.date, start: e.start, end: e.end, minutes: e.minutes, project_id, lead_id };
    });
    return { status: "connected", events: out };
  });
