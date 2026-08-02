/**
 * Drive folder intake poller — polled by pg_cron on the same cadence as the
 * Gmail intake hook. Secured with the same shared-secret gate.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/hooks/drive-intake")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env.DRIVE_INTAKE_SECRET ?? process.env.GMAIL_INTAKE_SECRET ?? "";
        if (!expected) return new Response("Intake hook secret not configured", { status: 503 });

        const provided =
          request.headers.get("x-intake-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!provided || !safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        if (!process.env.LOVABLE_API_KEY || !process.env.GOOGLE_DRIVE_API_KEY) {
          return Response.json(
            { ok: false, error: "Google Drive connector not linked (GOOGLE_DRIVE_API_KEY missing)" },
            { status: 503 },
          );
        }

        const { runDriveFolderIntake } = await import("@/lib/finance/drive-intake.server");
        try {
          const summary = await runDriveFolderIntake();
          return Response.json({ ok: true, ...summary });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
