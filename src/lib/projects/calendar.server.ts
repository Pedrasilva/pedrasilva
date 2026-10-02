/**
 * Google Calendar — server-only helpers. Every function takes the CALLER's
 * user id (from requireSupabaseAuth / verified OAuth state); nothing here is
 * exposed with a free-form user id. Refresh tokens are AES-GCM encrypted with
 * CALENDAR_TOKEN_KEY before they reach the database and never leave the server.
 */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
export const ALLOWED_DOMAIN = "pedrasilva.com";
export const CALLBACK_PATH = "/api/public/calendar/callback";
const ALLOWED_ORIGINS = new Set([
  "https://pedrasilva.lovable.app",
  "https://id-preview--945f60ba-be65-42ad-a5a3-dc640ed8b1b3.lovable.app",
  "http://localhost:8080",
]);
const TZ = "Europe/Lisbon";

export class CalendarExpiredError extends Error {
  constructor() {
    super("calendar_expired");
  }
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing server setting ${name}`);
  return v;
}

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64url");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

async function aesKey() {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("aes:" + env("CALENDAR_TOKEN_KEY")));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function hmacKey() {
  return crypto.subtle.importKey("raw", enc.encode("state:" + env("CALENDAR_TOKEN_KEY")), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function encryptToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), enc.encode(token)));
  return `${b64(iv)}.${b64(ct)}`;
}
async function decryptToken(s: string): Promise<string> {
  const [iv, ct] = s.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(ct));
  return new TextDecoder().decode(pt);
}

const PREVIEW_ORIGIN = "https://id-preview--945f60ba-be65-42ad-a5a3-dc640ed8b1b3.lovable.app";
const PROJECT_ID = "945f60ba-be65-42ad-a5a3-dc640ed8b1b3";
export function checkOrigin(origin: string): string {
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  // Other addresses of this same project (editor preview, dev URLs) use the
  // registered preview address for the Google round trip.
  try {
    const h = new URL(origin).hostname;
    if (h.includes(PROJECT_ID) && (h.endsWith(".lovableproject.com") || h.endsWith(".lovable.app"))) return PREVIEW_ORIGIN;
  } catch {
    /* fall through */
  }
  throw new Error("This address can't connect a calendar.");
}
const safePath = (p: string) => (p.startsWith("/") && !p.startsWith("//") ? p.slice(0, 200) : "/");

type State = { u: string; o: string; r: string; exp: number };
export async function signState(userId: string, origin: string, returnTo: string): Promise<string> {
  const body = b64(enc.encode(JSON.stringify({ u: userId, o: checkOrigin(origin), r: safePath(returnTo), exp: Date.now() + 10 * 60_000 } satisfies State)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64(sig)}`;
}
export async function verifyState(state: string): Promise<State | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), unb64(sig), enc.encode(body));
  if (!ok) return null;
  const s = JSON.parse(new TextDecoder().decode(unb64(body))) as State;
  if (s.exp < Date.now() || !ALLOWED_ORIGINS.has(s.o)) return null;
  return { ...s, r: safePath(s.r) };
}

export function authUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env("GOOGLE_CALENDAR_CLIENT_ID"),
    redirect_uri: origin + CALLBACK_PATH,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    hd: ALLOWED_DOMAIN,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string, origin: string): Promise<{ access_token: string; refresh_token?: string; scope?: string }> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: env("GOOGLE_CALENDAR_CLIENT_SECRET"),
      redirect_uri: origin + CALLBACK_PATH,
      grant_type: "authorization_code",
    }),
  });
  if (!r.ok) throw new Error(`Google token exchange failed [${r.status}]: ${await r.text()}`);
  return r.json();
}

/** Revoke at Google. Returns true when Google confirmed. */
export async function revokeAtGoogle(token: string): Promise<boolean> {
  try {
    const r = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** The primary calendar's id is the account email. Reads only the calendar summary. */
export async function primaryEmail(accessToken: string): Promise<string | null> {
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&fields=summary", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { summary?: string };
  return j.summary?.toLowerCase().trim() ?? null;
}

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function saveConnection(userId: string, email: string, refreshToken: string) {
  const db = await admin();
  const { error } = await db.from("user_calendar_connections").upsert({
    user_id: userId,
    google_email: email,
    refresh_token_enc: await encryptToken(refreshToken),
    connected_at: new Date().toISOString(),
    last_used_at: null,
  });
  if (error) throw error;
}

export async function getConnection(userId: string): Promise<{ google_email: string; connected_at: string } | null> {
  const db = await admin();
  const { data } = await db.from("user_calendar_connections").select("google_email, connected_at").eq("user_id", userId).maybeSingle();
  return data ?? null;
}

/** Disconnect: revoke at Google first, then always delete the row. */
export async function disconnect(userId: string): Promise<{ revoked: boolean }> {
  const db = await admin();
  const { data } = await db.from("user_calendar_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  let revoked = false;
  if (data) {
    try {
      revoked = await revokeAtGoogle(await decryptToken(data.refresh_token_enc));
    } catch {
      revoked = false;
    }
  }
  await db.from("user_calendar_connections").delete().eq("user_id", userId);
  return { revoked: !data || revoked };
}

async function accessTokenFor(userId: string): Promise<string | null> {
  const db = await admin();
  const { data } = await db.from("user_calendar_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: env("GOOGLE_CALENDAR_CLIENT_SECRET"),
      refresh_token: await decryptToken(data.refresh_token_enc),
      grant_type: "refresh_token",
    }),
  });
  if (r.status === 400 || r.status === 401) throw new CalendarExpiredError();
  if (!r.ok) throw new Error(`Google refresh failed [${r.status}]: ${await r.text()}`);
  await db.from("user_calendar_connections").update({ last_used_at: new Date().toISOString() }).eq("user_id", userId);
  return ((await r.json()) as { access_token: string }).access_token;
}

export type CalendarEvent = {
  id: string;
  title: string;
  date: string; // local YYYY-MM-DD
  start: string; // HH:MM local
  end: string;
  minutes: number;
  location: string | null;
  attendees: string[]; // emails, other than the person
};

function local(iso: string): { date: string; time: string; mins: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  const time = `${g("hour")}:${g("minute")}`;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time, mins: Number(g("hour")) * 60 + Number(g("minute")) };
}

/**
 * Week events for the CALLER's primary calendar. Skips private/confidential,
 * all-day, cancelled, declined, outside 07:00–20:00, under 15 minutes.
 * Never requests descriptions. Returns null when not connected.
 */
export async function weekEvents(userId: string, weekStart: string, weekEnd: string): Promise<CalendarEvent[] | null> {
  const token = await accessTokenFor(userId);
  if (!token) return null;
  const pad = (d: string, n: number) => {
    const x = new Date(d + "T00:00:00Z");
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString();
  };
  const out: CalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: pad(weekStart, -1),
      timeMax: pad(weekEnd, 2),
      maxResults: "250",
      fields: "nextPageToken,items(id,status,summary,location,visibility,eventType,start,end,attendees(email,self,responseStatus))",
    });
    if (pageToken) q.set("pageToken", pageToken);
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 401 || r.status === 403) throw new CalendarExpiredError();
    if (!r.ok) throw new Error(`Google Calendar read failed [${r.status}]: ${await r.text()}`);
    const j = (await r.json()) as {
      nextPageToken?: string;
      items?: Array<{
        id: string;
        status?: string;
        summary?: string;
        location?: string;
        visibility?: string;
        eventType?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        attendees?: Array<{ email?: string; self?: boolean; responseStatus?: string }>;
      }>;
    };
    for (const e of j.items ?? []) {
      if (e.status === "cancelled") continue;
      if (e.visibility === "private" || e.visibility === "confidential") continue;
      if (e.eventType && e.eventType !== "default") continue; // out of office, focus time, working location
      if (!e.start?.dateTime || !e.end?.dateTime) continue; // all-day
      if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
      const s = local(e.start.dateTime);
      const en = local(e.end.dateTime);
      if (s.date !== en.date) continue;
      if (s.date < weekStart || s.date > weekEnd) continue;
      if (s.mins < 7 * 60 || en.mins > 20 * 60) continue;
      const minutes = en.mins - s.mins;
      if (minutes < 15) continue;
      out.push({
        id: e.id,
        title: (e.summary ?? "").slice(0, 200),
        date: s.date,
        start: s.time,
        end: en.time,
        minutes,
        location: e.location ? e.location.slice(0, 200) : null,
        attendees: (e.attendees ?? []).filter((a) => !a.self && a.email).map((a) => a.email!.toLowerCase()).slice(0, 50),
      });
    }
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}
