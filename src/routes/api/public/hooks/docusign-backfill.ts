/**
 * One-off DocuSign reconciliation.
 *
 * DocuSign does not resend Connect calls for envelopes that completed while
 * the webhook was mis-parsing payloads. This endpoint re-reads the
 * authoritative envelope state for every signature row that is not yet in a
 * terminal state and applies the same patch logic as the webhook.
 *
 * It reads nothing from the request body and returns no PII — only counts.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/docusign-backfill")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { readDocusignConfig, getEnvelopeWithRecipients, fetchCompletedDocument } =
          await import("@/lib/docusign/docusign.server");

        const { data: rows } = await supabaseAdmin
          .from("psa_proposal_signatures")
          .select("id, proposal_id, status, docusign_envelope_id")
          .not("docusign_envelope_id", "is", null)
          .not("status", "in", "(completed,declined,voided)");

        if (!rows?.length) return Response.json({ checked: 0, updated: 0 });

        const cfg = readDocusignConfig();
        let updated = 0;
        const results: Array<{ envelope: string; status: string; applied: boolean }> = [];

        for (const row of rows) {
          const envelopeId = row.docusign_envelope_id as string;
          try {
            const envelope = await getEnvelopeWithRecipients(cfg, envelopeId);
            const byOrder = (o: string) => envelope.signers.find((s) => s.routingOrder === o);
            const clientSigned = byOrder("1");
            const psaSigned = byOrder("2");

            type SignaturePatch = {
              status?: string;
              status_note?: string;
              completed_at?: string;
              client_signed_at?: string;
              psa_signed_at?: string;
              signed_pdf_storage_path?: string;
            };
            const patch: SignaturePatch = {};
            if (clientSigned?.status === "completed" && clientSigned.signedDateTime) {
              patch.client_signed_at = clientSigned.signedDateTime;
            }
            if (psaSigned?.status === "completed" && psaSigned.signedDateTime) {
              patch.psa_signed_at = psaSigned.signedDateTime;
            }

            if (envelope.status === "completed") {
              patch.status = "completed";
              patch.completed_at = envelope.completedDateTime ?? new Date().toISOString();
              try {
                const pdf = await fetchCompletedDocument(cfg, envelopeId);
                const path = `${row.proposal_id}/signed-${envelopeId}.pdf`;
                const { error: upErr } = await supabaseAdmin.storage
                  .from("proposal-pdfs")
                  .upload(path, pdf, { contentType: "application/pdf", upsert: true });
                if (!upErr) patch.signed_pdf_storage_path = path;
              } catch (err) {
                console.error("docusign-backfill: signed PDF fetch failed", err);
              }
              await supabaseAdmin
                .from("psa_proposals")
                .update({ status: "accepted" })
                .eq("id", row.proposal_id);
            } else if (envelope.status === "declined") {
              patch.status = "declined";
              patch.status_note =
                envelope.signers.find((s) => s.status === "declined")?.declinedReason ?? "Recusado";
            } else if (envelope.status === "voided") {
              patch.status = "voided";
              patch.status_note = envelope.voidedReason ?? "Anulado";
            } else if (envelope.status === "delivered" && row.status === "sent") {
              patch.status = "delivered";
            }

            const applied = Object.keys(patch).length > 0;
            if (applied) {
              await supabaseAdmin
                .from("psa_proposal_signatures")
                .update(patch)
                .eq("id", row.id);
              updated++;
            }
            results.push({ envelope: envelopeId, status: envelope.status, applied });
          } catch (err) {
            console.error("docusign-backfill failed", envelopeId, err);
            results.push({ envelope: envelopeId, status: "error", applied: false });
          }
        }

        return Response.json({ checked: rows.length, updated, results });
      },
    },
  },
});
