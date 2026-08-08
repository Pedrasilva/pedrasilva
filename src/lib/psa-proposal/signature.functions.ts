/**
 * "Send for signature" — server functions.
 *
 * Reuses the artefact produced by the ordinary Send flow (the frozen revision
 * and its PDF in the `proposal-pdfs` bucket) and additionally creates a
 * DocuSign envelope with two sequential signers:
 *   routing order 1 — the client contact
 *   routing order 2 — the firm's authorised signatory (from server secrets)
 *
 * DocuSign emails each signer in turn; we send no email ourselves. The
 * proposal only becomes `accepted` when the Connect webhook reports the
 * envelope `completed` (i.e. both parties signed).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SuggestedClientSigner = {
  name: string | null;
  email: string | null;
  psaSignerName: string | null;
  psaSignerEmail: string | null;
  configured: boolean;
  configError: string | null;
};

/** Best-effort suggestion of the client signatory from the linked CRM contact. */
export const getSignatureDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { proposalId: string }) => {
    if (!input?.proposalId) throw new Error("proposalId em falta");
    return input;
  })
  .handler(async ({ data, context }): Promise<SuggestedClientSigner> => {
    const sb = context.supabase;
    let name: string | null = null;
    let email: string | null = null;

    const { data: proposal } = await sb
      .from("psa_proposals")
      .select("quote_id, client_snapshot")
      .eq("id", data.proposalId)
      .maybeSingle();

    const snapshot = (proposal?.client_snapshot ?? {}) as Record<string, unknown>;
    const snapName = typeof snapshot["contact_name"] === "string" ? snapshot["contact_name"] : null;
    const snapEmail = typeof snapshot["contact_email"] === "string" ? snapshot["contact_email"] : null;

    if (proposal?.quote_id) {
      const { data: quote } = await sb
        .from("fee_proposals")
        .select("contact_id, company_id")
        .eq("id", proposal.quote_id)
        .maybeSingle();
      if (quote?.contact_id) {
        const { data: contact } = await sb
          .from("contacts")
          .select("primeiro_nome, apelido, email")
          .eq("id", quote.contact_id)
          .maybeSingle();
        if (contact) {
          name = [contact.primeiro_nome, contact.apelido].filter(Boolean).join(" ") || null;
          email = contact.email ?? null;
        }
      }
      if (!email && quote?.company_id) {
        const { data: billing } = await sb
          .from("contacts")
          .select("primeiro_nome, apelido, email")
          .eq("company_id", quote.company_id)
          .eq("is_billing_contact", true)
          .limit(1)
          .maybeSingle();
        if (billing) {
          name = name ?? ([billing.primeiro_nome, billing.apelido].filter(Boolean).join(" ") || null);
          email = billing.email ?? null;
        }
      }
    }

    let psaName: string | null = null;
    let psaEmail: string | null = null;
    let configError: string | null = null;
    let configured = false;
    try {
      const { readDocusignConfig, readPsaSigner } = await import("@/lib/docusign/docusign.server");
      readDocusignConfig();
      const signer = readPsaSigner();
      psaName = signer.name;
      psaEmail = signer.email;
      configured = true;
    } catch (err) {
      configError = err instanceof Error ? err.message : "DocuSign não configurado.";
    }

    return {
      name: name ?? snapName,
      email: email ?? snapEmail,
      psaSignerName: psaName,
      psaSignerEmail: psaEmail,
      configured,
      configError,
    };
  });

/** Creates + dispatches the DocuSign envelope for an already-sent revision. */
export const sendRevisionForSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      proposalId: string;
      snapshotId: string;
      clientName: string;
      clientEmail: string;
    }) => {
      if (!input?.proposalId || !input?.snapshotId) throw new Error("Revisão em falta");
      const name = (input.clientName ?? "").trim();
      const email = (input.clientEmail ?? "").trim();
      if (name.length < 2) throw new Error("Nome do signatário do cliente em falta");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Email do cliente inválido");
      return { ...input, clientName: name, clientEmail: email };
    },
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { readDocusignConfig, readPsaSigner, createAndSendEnvelope } = await import(
      "@/lib/docusign/docusign.server"
    );
    const cfg = readDocusignConfig();
    const psa = readPsaSigner();

    const { data: snap, error: snapErr } = await sb
      .from("psa_proposal_snapshots")
      .select("id, proposal_id, rev_number, pdf_storage_path, pdf_filename")
      .eq("id", data.snapshotId)
      .single();
    if (snapErr) throw snapErr;
    if (snap.proposal_id !== data.proposalId) throw new Error("Revisão não pertence a esta proposta");
    if (!snap.pdf_storage_path) throw new Error("Esta revisão não tem PDF anexado.");

    const { data: proposal } = await sb
      .from("psa_proposals")
      .select("title")
      .eq("id", data.proposalId)
      .maybeSingle();

    // Private bucket — read with the service client, after authorising above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from("proposal-pdfs")
      .download(snap.pdf_storage_path);
    if (dlErr || !file) throw new Error("Não foi possível ler o PDF da revisão.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const documentBase64 = btoa(bin);

    const revLabel = String(snap.rev_number ?? 0).padStart(2, "0");
    const envelopeId = await createAndSendEnvelope({
      cfg,
      emailSubject: `${proposal?.title ?? "Proposta"} — Rev ${revLabel}`,
      emailBlurb:
        "Segue a proposta para assinatura. Após a sua assinatura, o documento segue para contra-assinatura.",
      documentName: snap.pdf_filename ?? `proposta-rev-${revLabel}.pdf`,
      documentBase64,
      client: { name: data.clientName, email: data.clientEmail },
      psa,
    });

    const { data: row, error: insErr } = await sb
      .from("psa_proposal_signatures")
      .insert({
        proposal_id: data.proposalId,
        snapshot_id: snap.id,
        docusign_envelope_id: envelopeId,
        status: "sent",
        client_signer_name: data.clientName,
        client_signer_email: data.clientEmail,
        psa_signer_name: psa.name,
        psa_signer_email: psa.email,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return { signatureId: row.id as string, envelopeId };
  });
