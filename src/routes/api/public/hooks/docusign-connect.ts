/**
 * DocuSign Connect webhook — envelope lifecycle events.
 *
 * Register this URL in DocuSign Admin → Connect, with "Include HMAC
 * signature" enabled and the same secret stored as DOCUSIGN_CONNECT_HMAC_KEY.
 *
 * The incoming payload only carries { event, data: { envelopeId } } — no
 * embedded envelope/recipient detail — so this handler treats it as a
 * trigger only and always fetches the authoritative envelope + recipient
 * status directly from the DocuSign API via getEnvelopeWithRecipients().
 *
 * completed  → download the countersigned PDF, store it, mark the proposal
 *              `accepted` (the existing trigger stamps locked_at/outcome).
 * declined / voided → record on the signature row only; a human decides what
 *              happens to the proposal.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyHmac(rawBody: string, headerSig: string | null, secret: string): boolean {
  if (!headerSig) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(headerSig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/docusign-connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["DOCUSIGN_CONNECT_HMAC_KEY"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const sig =
          request.headers.get("x-docusign-signature-1") ??
          request.headers.get("X-DocuSign-Signature-1");
        if (!verifyHmac(raw, sig, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: { data?: { envelopeId?: string } };
        try {
          payload = JSON.parse(raw) as { data?: { envelopeId?: string } };
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const envelopeId = payload.data?.envelopeId;
        if (!envelopeId) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: sigRow } = await supabaseAdmin
          .from("psa_proposal_signatures")
          .select("id, proposal_id, status")
          .eq("docusign_envelope_id", envelopeId)
          .maybeSingle();
        if (!sigRow) return new Response("ok");

        const { readDocusignConfig, getEnvelopeWithRecipients, fetchCompletedDocument } =
          await import("@/lib/docusign/docusign.server");
        const cfg = readDocusignConfig();
        const envelope = await getEnvelopeWithRecipients(cfg, envelopeId);

        const byOrder = (order: string) => envelope.signers.find((s) => s.routingOrder === order);
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
            const path = `${sigRow.proposal_id}/signed-${envelopeId}.pdf`;
            const { error: upErr } = await supabaseAdmin.storage
              .from("proposal-pdfs")
              .upload(path, pdf, { contentType: "application/pdf", upsert: true });
            if (!upErr) patch.signed_pdf_storage_path = path;
          } catch (err) {
            console.error("docusign-connect: signed PDF fetch failed", err);
          }

          await supabaseAdmin
            .from("psa_proposals")
            .update({ status: "accepted" })
            .eq("id", sigRow.proposal_id);

          // Stamp the signature milestone on the parent quote so the quote
          // workspace can move Approved → Signed → Project without manual
          // bookkeeping.
          const { data: prop } = await supabaseAdmin
            .from("psa_proposals")
            .select("quote_id")
            .eq("id", sigRow.proposal_id)
            .maybeSingle();
          if (prop?.quote_id) {
            await supabaseAdmin
              .from("fee_proposals")
              .update({
                signed_at: patch.completed_at,
                signed_method: "docusign",
              })
              .eq("id", prop.quote_id)
              .is("signed_at", null);
          }
        } else if (envelope.status === "declined") {
          patch.status = "declined";
          patch.status_note =
            envelope.signers.find((s) => s.status === "declined")?.declinedReason ?? "Recusado";
        } else if (envelope.status === "voided") {
          patch.status = "voided";
          patch.status_note = envelope.voidedReason ?? "Anulado";
        } else if (envelope.status === "delivered" && sigRow.status === "sent") {
          patch.status = "delivered";
        }

        if (Object.keys(patch).length) {
          await supabaseAdmin
            .from("psa_proposal_signatures")
            .update(patch)
            .eq("id", sigRow.id);
        }

        return new Response("ok");
      },
    },
  },
});
