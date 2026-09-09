/**
 * Weekly "please log your hours" reminder.
 *
 * Runs once a week (Monday morning, via pg_cron). For the week that just
 * ended it looks at everyone on the studio roster and reminds — by email and
 * in the app bell — anyone whose week is not submitted or approved yet.
 *
 * Read-only against the timesheet data: it never creates, edits or approves
 * hours, and never touches the weekly approval workflow.
 *
 * Security: shared-secret gate, same secret the other cron hooks use.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

const DEFAULT_DAILY_HOURS = 8;
const DEFAULT_DAYS_PER_WEEK = 5;
const APP_URL = "https://pedrasilva.lovable.app";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the week that precedes `ref`. */
function previousWeekStart(ref: Date): Date {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow - 7);
  return d;
}

function fmtHours(n: number): string {
  return `${Math.round(n * 10) / 10}h`;
}

function weekLabel(start: string, end: string, lang: "pt" | "en"): string {
  const locale = lang === "en" ? "en-GB" : "pt-PT";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  const s = new Date(`${start}T00:00:00Z`).toLocaleDateString(locale, opts);
  const e = new Date(`${end}T00:00:00Z`).toLocaleDateString(locale, {
    ...opts,
    year: "numeric",
  });
  return `${s} – ${e}`;
}

export const Route = createFileRoute("/api/public/hooks/timesheet-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["TIMESHEET_REMINDER_SECRET"] ?? process.env["GMAIL_INTAKE_SECRET"] ?? "";
        if (!expected) return new Response("Hook secret not configured", { status: 503 });
        const provided =
          request.headers.get("x-intake-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!provided || !safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const start = previousWeekStart(new Date());
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 6);
        const weekStart = iso(start);
        const weekEnd = iso(end);

        const [mapRes, collabRes, weekRes, entryRes] = await Promise.all([
          supabaseAdmin.rpc("pm_list_user_resource_map"),
          supabaseAdmin
            .from("collaborators")
            .select(
              "id, nome, email, language_preference, archived_at, daily_hours, days_per_week",
            ),
          supabaseAdmin
            .from("pm_timesheet_weeks")
            .select("user_id, status")
            .eq("week_start", weekStart),
          supabaseAdmin
            .from("pm_time_entries")
            .select("user_id, hours, entry_type")
            .gte("entry_date", weekStart)
            .lte("entry_date", weekEnd),
        ]);

        const firstError =
          mapRes.error ?? collabRes.error ?? weekRes.error ?? entryRes.error ?? null;
        if (firstError) {
          console.error("[timesheet-reminder] query failed:", firstError.message);
          return new Response(JSON.stringify({ error: "Query failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const collaborators = new Map(
          (collabRes.data ?? []).map((c) => [c.id as string, c]),
        );
        const weekStatus = new Map(
          (weekRes.data ?? []).map((w) => [w.user_id as string, w.status as string]),
        );

        const worked = new Map<string, number>();
        for (const e of entryRes.data ?? []) {
          const type = e.entry_type as string;
          if (type !== "project" && type !== "internal") continue; // leave never counts as work
          worked.set(e.user_id as string, (worked.get(e.user_id as string) ?? 0) + (Number(e.hours) || 0));
        }

        let reminded = 0;
        let skipped = 0;
        const failures: string[] = [];
        const seen = new Set<string>();

        for (const m of (mapRes.data ?? []) as Array<{
          user_id: string;
          collaborator_id: string | null;
        }>) {
          if (!m.user_id || seen.has(m.user_id)) continue;
          seen.add(m.user_id);
          const collab = m.collaborator_id ? collaborators.get(m.collaborator_id) : undefined;
          if (!collab || collab.archived_at) continue;

          const status = weekStatus.get(m.user_id);
          if (status === "submitted" || status === "approved") {
            skipped++;
            continue;
          }

          const capacity =
            (Number(collab.daily_hours) || DEFAULT_DAILY_HOURS) *
            (Number(collab.days_per_week) || DEFAULT_DAYS_PER_WEEK);
          const recorded = worked.get(m.user_id) ?? 0;
          const lang: "pt" | "en" =
            String(collab.language_preference ?? "pt").startsWith("en") ? "en" : "pt";
          const label = weekLabel(weekStart, weekEnd, lang);

          // In-app bell — always, even without an email address on file.
          const { error: notifyErr } = await supabaseAdmin.rpc("notify_user", {
            _user_id: m.user_id,
            _kind: "timesheet_reminder",
            _title:
              lang === "en"
                ? `Your timesheet for ${label} is not submitted`
                : `A folha de horas de ${label} não foi submetida`,
            _body:
              lang === "en"
                ? `${fmtHours(recorded)} recorded of ${fmtHours(capacity)} normal weekly capacity.`
                : `${fmtHours(recorded)} registadas de ${fmtHours(capacity)} de capacidade semanal normal.`,
            _link_path: "/projects/timesheet",
            _module: "projects",
            _dedupe_key: `timesheet-reminder-${m.user_id}-${weekStart}`,
          });
          if (notifyErr) console.error("[timesheet-reminder] notify failed:", notifyErr.message);

          if (!collab.email) continue;
          try {
            const result = await sendTemplateEmail("timesheet-reminder", collab.email as string, {
              idempotencyKey: `timesheet-reminder-${m.user_id}-${weekStart}`,
              templateData: {
                name: (collab.nome as string) ?? "",
                weekLabel: label,
                recordedHours: fmtHours(recorded),
                capacityHours: fmtHours(capacity),
                timesheetUrl: `${APP_URL}/projects/timesheet`,
                language: lang,
              },
            });
            if (result.sent) reminded++;
            else failures.push(`${m.user_id}:${result.reason}`);
          } catch (err) {
            const code =
              err && typeof err === "object" && "code" in err
                ? String((err as { code?: unknown }).code)
                : "send_failed";
            failures.push(`${m.user_id}:${code}`);
            console.error("[timesheet-reminder] send failed:", err);
          }
        }

        return new Response(
          JSON.stringify({ ok: true, weekStart, weekEnd, reminded, skipped, failures }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
