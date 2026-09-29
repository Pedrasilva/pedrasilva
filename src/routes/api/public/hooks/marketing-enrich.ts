/**
 * Marketing Pass 3 — AI enrichment poller. Called by pg_cron `marketing-enrich-every-5-min`.
 * Gate secret lives only in Vault, checked by `marketing_enrich_secret_matches` (service_role only).
 */
import { createFileRoute } from "@tanstack/react-router";

const BATCH = 3;

export const Route = createFileRoute("/api/public/hooks/marketing-enrich")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("x-enrich-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!provided) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ok, error: gateErr } = await supabaseAdmin.rpc(
          "marketing_enrich_secret_matches" as never,
          { p_secret: provided } as never,
        );
        if (gateErr) return new Response("Enrich gate unavailable", { status: 503 });
        if (ok !== true) return new Response("Unauthorized", { status: 401 });

        const { loadEnrichContext, enrichCapture, recordEnrichFailure, AiStopError } = await import(
          "@/lib/marketing/enrich.server"
        );
        const summary = { processed: 0, enriched: 0, failed: 0, errors: [] as string[] };
        try {
          const ctx = await loadEnrichContext();
          if (!ctx) return Response.json({ ok: true, skipped: "no bible" });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: queue, error } = await (supabaseAdmin as any)
            .from("marketing_captures")
            .select("id")
            .eq("status", "new")
            .lt("enrichment_attempts", 3)
            .order("received_at", { ascending: true })
            .limit(BATCH);
          if (error) throw new Error(error.message);

          for (const { id } of (queue ?? []) as Array<{ id: string }>) {
            summary.processed++;
            try {
              await enrichCapture(id, ctx);
              summary.enriched++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              summary.failed++;
              summary.errors.push(`${id}: ${msg}`);
              await recordEnrichFailure(id, msg);
              if (err instanceof AiStopError) break;
            }
          }
          return Response.json({ ok: true, ...summary });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err), ...summary },
            { status: 500 },
          );
        }
      },
    },
  },
});
