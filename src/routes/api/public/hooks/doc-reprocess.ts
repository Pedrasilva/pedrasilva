/**
 * Admin/cron re-extraction hook.
 *
 * Re-runs the D3 extraction + direction detection on PENDING review-queue
 * items, updating them in place. Used after an extraction/direction fix so
 * already-queued documents pick up the corrected logic without re-emailing.
 *
 * Security: shared-secret gate (the same secret the pg_cron intake job uses).
 * Approved / rejected rows are refused by `reprocessQueueItem` itself, so this
 * endpoint can never rewrite a document that already produced live financial
 * records.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/hooks/doc-reprocess")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.GMAIL_INTAKE_SECRET ?? "";
        if (!expected) return new Response("Hook secret not configured", { status: 503 });
        const provided =
          request.headers.get("x-intake-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!provided || !safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { ids?: unknown; all_pending?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          /* empty body = all pending */
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { reprocessQueueItem } = await import("@/lib/finance/doc-intake.server");

        let ids = Array.isArray(body.ids) ? (body.ids as string[]).filter(Boolean) : [];
        if (ids.length === 0) {
          const { data } = await supabaseAdmin
            .from("financial_document_review_queue")
            .select("id")
            .eq("status", "pending_review")
            .order("created_at", { ascending: false })
            .limit(25);
          ids = (data ?? []).map((r) => r.id);
        }

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const id of ids) {
          const res = await reprocessQueueItem(id);
          results.push({ id, ok: res.ok, ...(res.error ? { error: res.error } : {}) });
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
