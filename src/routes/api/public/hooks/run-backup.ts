import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { cronTriggerSchema } from "@/lib/backups/backup.functions";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/hooks/run-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.BACKUP_HOOK_SECRET ?? "";
        if (!expected) {
          return new Response("Backup hook secret not configured", { status: 503 });
        }
        const provided =
          request.headers.get("x-backup-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!provided || !safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          /* ignore */
        }
        const parsed = cronTriggerSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid trigger" }, { status: 400 });
        }
        try {
          const { performBackup } = await import("@/lib/backups/backup-core.server");
          const result = await performBackup(parsed.data.trigger, null);
          return Response.json({ ok: true, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
