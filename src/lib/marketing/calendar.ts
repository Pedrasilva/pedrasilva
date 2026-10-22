/** Editorial calendar helpers: Europe/Lisbon time, weekly target and repetition warnings. Client- and server-safe. */
export const LISBON = "Europe/Lisbon";
export const WEEKLY_TARGET = 3;

function partsAt(utcMs: number) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: LISBON, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), mi: g("minute"), s: g("second") };
}
function offsetMs(utcMs: number) {
  const p = partsAt(utcMs);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(utcMs / 1000) * 1000;
}
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-26" + "10:00" in Lisbon → UTC ISO string. */
export function lisbonToUtcIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMs(guess);
  t = guess - offsetMs(t);
  return new Date(t).toISOString();
}

/** UTC ISO → Lisbon calendar date and time. */
export function lisbonParts(iso: string): { date: string; time: string } {
  const p = partsAt(new Date(iso).getTime());
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

/** Monday (YYYY-MM-DD) of the week containing a YYYY-MM-DD date. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}

export type CalendarPost = { id: string; at: string; pillar: string | null; persona: string | null; projectId: string | null };
export type RepetitionField = "pillar" | "persona" | "project";
export type RepetitionWarning = { postId: string; field: RepetitionField; value: string; kind: "consecutive" | "window" };

/** Weeks (by Monday) among `weeks` with fewer than the target number of posts. */
export function lowWeeks(posts: CalendarPost[], weeks: string[], target = WEEKLY_TARGET) {
  const counts = new Map<string, number>();
  for (const p of posts) { const w = mondayOf(lisbonParts(p.at).date); counts.set(w, (counts.get(w) ?? 0) + 1); }
  return weeks.map((w) => ({ week: w, count: counts.get(w) ?? 0 })).filter((w) => w.count < target);
}

const valueOf = (p: CalendarPost, f: RepetitionField) => (f === "project" ? p.projectId : p[f])?.trim() || null;
const DAY = 86_400_000;

/** Same pillar, persona or project two posts in a row, or more than twice within 7 days. */
export function repetitionWarnings(posts: CalendarPost[]): RepetitionWarning[] {
  const sorted = [...posts].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const out: RepetitionWarning[] = [];
  const fields: RepetitionField[] = ["pillar", "persona", "project"];
  sorted.forEach((p, i) => {
    for (const f of fields) {
      const v = valueOf(p, f);
      if (!v) continue;
      if (i > 0 && valueOf(sorted[i - 1], f) === v) out.push({ postId: p.id, field: f, value: v, kind: "consecutive" });
      const t = new Date(p.at).getTime();
      const inWindow = sorted.filter((q) => { const qt = new Date(q.at).getTime(); return qt <= t && qt > t - 7 * DAY && valueOf(q, f) === v; });
      if (inWindow.length > 2) out.push({ postId: p.id, field: f, value: v, kind: "window" });
    }
  });
  return out;
}

/** Grid order: approved-but-undated first, then scheduled newest (latest date) first. */
export function gridOrder<T extends { status: string; scheduled_at: string | null; created_at: string }>(rows: T[]): T[] {
  const undated = rows.filter((r) => !r.scheduled_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const dated = rows.filter((r) => r.scheduled_at).sort((a, b) => b.scheduled_at!.localeCompare(a.scheduled_at!));
  return [...undated, ...dated];
}
