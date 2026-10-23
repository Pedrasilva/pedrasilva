/**
 * Intake source health: alerts Luis (bell + email) when a source (docs@, Drive,
 * ideas@) fails 3 runs in a row, or finds nothing for 48 working hours on a
 * working day. One alert per source, kind and Lisbon day (intake_source_alerts).
 */
import type { IntakeSource } from "./intake-health";

export const ALERT_EMAIL = "luis@pedrasilva.com";
const FAILURES_IN_A_ROW = 3;
const SILENCE_WORKING_HOURS = 48;

const LABEL: Record<IntakeSource, string> = {
  docs: "docs@pedrasilva.com",
  drive: "Google Drive (Finance Intake)",
  ideas: "ideas@pedrasilva.com",
};

function lisbonParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), day: `${get("year")}-${get("month")}-${get("day")}` };
}

export function isWorkingDay(d: Date): boolean {
  const w = lisbonParts(d).weekday;
  return w !== "Sat" && w !== "Sun";
}

/** The instant `hours` working hours (Mon–Fri, Lisbon) before `now`. */
export function workingHoursBefore(now: Date, hours: number): Date {
  let t = now.getTime();
  let left = hours;
  for (let i = 0; i < 24 * 30 && left > 0; i++) {
    t -= 3600_000;
    if (isWorkingDay(new Date(t))) left--;
  }
  return new Date(t);
}

export type RunRow = { ok: boolean; items: number; ran_at: string; error: string | null };

/** Pure decision used by the hook and the tests. */
export function decideAlerts(
  now: Date,
  lastRuns: RunRow[],
  firstRunAt: string | null,
  foundSinceCutoff: number,
): Array<"failures" | "silence"> {
  const out: Array<"failures" | "silence"> = [];
  if (lastRuns.length >= FAILURES_IN_A_ROW && lastRuns.slice(0, FAILURES_IN_A_ROW).every((r) => !r.ok)) out.push("failures");
  if (isWorkingDay(now) && firstRunAt) {
    const cutoff = workingHoursBefore(now, SILENCE_WORKING_HOURS);
    if (new Date(firstRunAt) <= cutoff && foundSinceCutoff === 0) out.push("silence");
  }
  return out;
}

export async function recordIntakeRun(source: IntakeSource, ok: boolean, items: number, error: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  await db.from("intake_source_runs").insert({ source, ok, items, error: error?.slice(0, 1000) ?? null });

  const now = new Date();
  const cutoff = workingHoursBefore(now, SILENCE_WORKING_HOURS).toISOString();
  const [{ data: last }, { data: first }, { count }] = await Promise.all([
    db.from("intake_source_runs").select("ok, items, ran_at, error").eq("source", source).order("ran_at", { ascending: false }).limit(FAILURES_IN_A_ROW),
    db.from("intake_source_runs").select("ran_at").eq("source", source).order("ran_at", { ascending: true }).limit(1),
    db.from("intake_source_runs").select("id", { count: "exact", head: true }).eq("source", source).gt("items", 0).gte("ran_at", cutoff),
  ]);
  const kinds = decideAlerts(now, (last ?? []) as RunRow[], first?.[0]?.ran_at ?? null, count ?? 0);
  for (const kind of kinds) {
    const lastErr = (last ?? []).find((r: RunRow) => r.error)?.error ?? "";
    const message = kind === "failures"
      ? `${LABEL[source]}: ${FAILURES_IN_A_ROW} recolhas seguidas falharam · ${FAILURES_IN_A_ROW} runs in a row failed. ${lastErr}`.trim()
      : `${LABEL[source]}: nada recebido nas últimas ${SILENCE_WORKING_HOURS} h úteis · nothing received in the last ${SILENCE_WORKING_HOURS} working hours.`;
    await raiseAlert(db, source, kind, lisbonParts(now).day, message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function raiseAlert(db: any, source: IntakeSource, kind: "failures" | "silence", day: string, message: string) {
  const { data: inserted } = await db
    .from("intake_source_alerts")
    .upsert({ source, kind, alert_day: day, message }, { onConflict: "source,kind,alert_day", ignoreDuplicates: true })
    .select("id");
  const alertId = inserted?.[0]?.id as string | undefined;
  if (!alertId) return; // already alerted today

  const userId = await findUserId(db, ALERT_EMAIL);
  if (userId) {
    await db.from("notifications").insert({
      user_id: userId, kind: "intake_source_alert", module: "finance",
      title: kind === "failures" ? `Origem com falhas: ${LABEL[source]}` : `Origem sem documentos: ${LABEL[source]}`,
      body: message.slice(0, 300), link_path: "/finance/admin/imports",
      dedupe_key: `intake_source_alert:${source}:${kind}:${day}`,
    });
  }
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("intake-source-alert", ALERT_EMAIL, {
      templateData: { source: LABEL[source], message, kind },
      idempotencyKey: `intake-source-alert-${source}-${kind}-${day}`,
    });
    await db.from("intake_source_alerts").update({ emailed: true }).eq("id", alertId);
  } catch (e) {
    await db.from("intake_source_alerts").update({ email_error: e instanceof Error ? e.message : String(e) }).eq("id", alertId);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findUserId(db: any, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = data.users.find((u: { email?: string }) => u.email?.toLowerCase() === email);
    if (hit) return hit.id as string;
    if (data.users.length < 200) break;
  }
  return null;
}
