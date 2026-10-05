/**
 * Backfill hook for incoming payments: reads payer/beneficiary on pending
 * payment proofs, receipts and bank notices that lack them, sets the
 * direction, and groups incoming ones into suggested recebimentos.
 * Nothing is marked paid. Secured with the intake shared secret.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/hooks/recebimentos-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.GMAIL_INTAKE_SECRET ?? "";
        if (!expected) return new Response("Hook secret not configured", { status: 503 });
        const provided = request.headers.get("x-intake-secret") ?? "";
        if (!provided || !safeEqual(provided, expected)) return new Response("Unauthorized", { status: 401 });
        let body: { limit?: number; group_only?: boolean } = {};
        try { body = await request.json(); } catch { /* defaults */ }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rec = await import("@/lib/finance/recebimentos.server");
        const { loadPsaIdentity } = await import("@/lib/finance/recipient-rule.server");
        const psa = await loadPsaIdentity();

        const results: Array<{ id: string; direction: string | null; read: boolean; recebimento?: string | null; joined?: boolean; error?: string }> = [];
        if (!body.group_only) {
          const { data: items } = await supabaseAdmin
            .from("financial_document_review_queue")
            .select("id, intake_type, intake_route, intake_type_confidence, raw_extraction, source_bucket, source_file_url, split_page_first, split_page_last, split_of_file_url")
            .eq("status", "pending_review")
            .in("intake_type", [...rec.PAYMENT_PROOF_TYPES])
            .is("payment_direction", null)
            .is("payer_name", null)
            .is("beneficiary_name", null)
            .order("created_at", { ascending: true })
            .limit(Math.min(body.limit ?? 8, 20));
          for (const it of items ?? []) {
            try {
              const raw = (it.raw_extraction ?? {}) as Record<string, string | null>;
              let p: import("@/lib/finance/recebimentos.server").PaymentParties | null =
                raw.payer_name || raw.beneficiary_name
                  ? { payer: { name: raw.payer_name ?? null, vat: raw.payer_vat ?? null, iban: raw.payer_iban ?? null },
                      beneficiary: { name: raw.beneficiary_name ?? null, vat: raw.beneficiary_vat ?? null, iban: raw.beneficiary_iban ?? null },
                      description: raw.payment_description ?? null }
                  : null;
              if (!p && it.source_file_url) {
                p = await rec.readParties({
                  bucket: it.source_bucket ?? "financial-documents", path: it.source_file_url,
                  pages: it.split_of_file_url && it.split_page_first ? { first: it.split_page_first, last: it.split_page_last ?? it.split_page_first } : null,
                });
              }
              if (!p) { results.push({ id: it.id, direction: null, read: false, error: "no read" }); continue; }
              const cols = await rec.partiesColumns(p, psa);
              const patch: Record<string, unknown> = { ...cols };
              // Mark read even when nothing was printed, so the item isn't re-read.
              if (!cols.payer_name && !cols.beneficiary_name) patch.payer_name = "";
              // An incoming client proof sitting in Triagem only for a missing recipient → Pagamentos.
              if (cols.payment_direction === "incoming" && it.intake_route === "triage" && it.intake_type !== "nota_lancamento" && Number(it.intake_type_confidence ?? 0) >= 0.7) patch.intake_route = "payments";
              await supabaseAdmin.from("financial_document_review_queue").update(patch as never).eq("id", it.id);
              let r: { recebimentoId: string | null; joined: boolean } = { recebimentoId: null, joined: false };
              if (cols.payment_direction === "incoming") r = await rec.attachProof(it.id);
              results.push({ id: it.id, direction: cols.payment_direction, read: true, recebimento: r.recebimentoId, joined: r.joined });
            } catch (e) {
              results.push({ id: it.id, direction: null, read: false, error: e instanceof Error ? e.message : String(e) });
            }
          }
        }
        const { count: remaining } = await supabaseAdmin
          .from("financial_document_review_queue").select("id", { count: "exact", head: true })
          .eq("status", "pending_review").in("intake_type", [...rec.PAYMENT_PROOF_TYPES])
          .is("payment_direction", null).is("payer_name", null).is("beneficiary_name", null);
        return Response.json({ ok: true, processed: results.length, remaining, results });
      },
    },
  },
});
