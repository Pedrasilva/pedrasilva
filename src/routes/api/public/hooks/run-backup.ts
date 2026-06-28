import { createFileRoute } from "@tanstack/react-router";
import { cronTriggerSchema } from "@/lib/backups/backup.functions";

export const Route = createFileRoute("/api/public/hooks/run-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? request.headers.get("x-api-key") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apiKey !== expected) {
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
