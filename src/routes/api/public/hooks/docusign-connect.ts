/**
 * DocuSign Connect webhook — envelope lifecycle events.
 *
 * Register this URL in DocuSign Admin → Connect, with "Include HMAC
 * signature" enabled and the same secret stored as DOCUSIGN_CONNECT_HMAC_KEY.
 *
 * completed  → download the countersigned PDF, store it, mark the proposal
 *              `accepted` (the existing trigger stamps locked_at/outcome).
 * declined / voided → record on the signature row only; a human decides what
 *              happens to the proposal.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

type ConnectPayload = {
  event?: string;
  data?: {
    envelopeId?: string;
    envelopeSummary?: {
      status?: string;
      completedDateTime?: string;
      recipients?: {
        signers?: Array<{
          routingOrder?: string;
          status?: string;
          signedDateTime?: string;
          name?: string;
          declinedReason?: string;
        }>;
      };
      voidedReason?: string;
    };
  };
};

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

        let payload: ConnectPayload;
        try {
          payload = JSON.parse(raw) as ConnectPayload;
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const envelopeId = payload.data?.envelopeId;
        const summary = payload.data?.envelopeSummary;
        const status = (summary?.status ?? payload.event ?? "").toLowerCase();
        if (!envelopeId || !status) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: sigRow } = await supabaseAdmin
          .from("psa_proposal_signatures")
          .select("id, proposal_id, status")
          .eq("docusign_envelope_id", envelopeId)
          .maybeSingle();
        if (!sigRow) return new Response("ok");

        const signers = summary?.recipients?.signers ?? [];
        const byOrder = (order: string) => signers.find((s) => String(s.routingOrder) === order);
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
        if (clientSigned?.status?.toLowerCase() === "completed" && clientSigned.signedDateTime) {
          patch.client_signed_at = clientSigned.signedDateTime;
        }
        if (psaSigned?.status?.toLowerCase() === "completed" && psaSigned.signedDateTime) {
          patch.psa_signed_at = psaSigned.signedDateTime;
        }

        if (status === "completed") {
          patch.status = "completed";
          patch.completed_at = summary?.completedDateTime ?? new Date().toISOString();

          // Store the countersigned PDF alongside the revision PDFs.
          try {
            const { readDocusignConfig, fetchCompletedDocument } = await import(
              "@/lib/docusign/docusign.server"
            );
            const cfg = readDocusignConfig();
            const pdf = await fetchCompletedDocument(cfg, envelopeId);
            const path = `${sigRow.proposal_id}/signed-${envelopeId}.pdf`;
            const { error: upErr } = await supabaseAdmin.storage
              .from("proposal-pdfs")
              .upload(path, pdf, { contentType: "application/pdf", upsert: true });
            if (!upErr) patch.signed_pdf_storage_path = path;
          } catch (err) {
            console.error("docusign-connect: signed PDF fetch failed", err);
          }

          // Both parties signed → the proposal is accepted.
          await supabaseAdmin
            .from("psa_proposals")
            .update({ status: "accepted" })
            .eq("id", sigRow.proposal_id);
        } else if (status === "declined") {
          patch.status = "declined";
          patch.status_note =
            signers.find((s) => s.status?.toLowerCase() === "declined")?.declinedReason ??
            "Recusado";
        } else if (status === "voided") {
          patch.status = "voided";
          patch.status_note = summary?.voidedReason ?? "Anulado";
        } else if (status === "delivered" && sigRow.status === "sent") {
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
