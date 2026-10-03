/**
 * Cost-rate periods hook (pg_cron). Every 10 minutes it drains the change
 * queue (salary / BO settings / schedule changes) and rebuilds periods from
 * the earliest affected date; body {"full":true} = daily safety rebuild.
 * Never touches saved time entries.
 * Security: same shared secret as the other cron hooks.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/hooks/cost-rates")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["TIMESHEET_REMINDER_SECRET"] ?? process.env["GMAIL_INTAKE_SECRET"] ?? "";
        if (!expected) return new Response("Hook secret not configured", { status: 503 });
        const provided = request.headers.get("x-intake-secret") ?? "";
        if (!provided || !safeEqual(provided, expected)) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { full?: boolean };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processQueue, rebuildPeriods } = await import("@/lib/projects/cost-rates.server");
        try {
          const queued = await processQueue(supabaseAdmin);
          const full = body.full ? await rebuildPeriods(supabaseAdmin) : null;
          return Response.json({ ok: true, queued, full });
        } catch (e) {
          console.error("cost-rates hook", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
