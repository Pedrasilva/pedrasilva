/**
 * Recipient check (server-only): a document addressed to a company or person
 * other than the firm becomes "outra_entidade" and is never treated as a PSA
 * purchase or bank document. Known entities (Finance → Inbox → Regras) set
 * what happens next: archive, ignore or forward to an email address.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mentionsFirm, normalizeVat, sameVat } from "@/lib/finance/doc-intake.server";

export type OtherEntity = {
  id: string;
  name: string;
  nif: string;
  action: "archive" | "ignore" | "forward";
  forward_email: string | null;
};

export const entityNifKey = (v: string | null | undefined) =>
  normalizeVat(v)?.replace(/^PT/, "").toLowerCase() ?? null;

export async function loadOtherEntities(): Promise<OtherEntity[]> {
  const { data } = await supabaseAdmin
    .from("finance_other_entities")
    .select("id, name, nif, action, forward_email");
  return (data ?? []) as OtherEntity[];
}

export type RecipientResult = {
  other: boolean;
  verify: boolean;
  entity: OtherEntity | null;
};

export function recipientCheck(opts: {
  own: { vat: string | null; name: string | null };
  name: string | null;
  vat: string | null;
  /** Issuer of the document; when it is the firm, the recipient is its client. */
  sellerName?: string | null;
  sellerVat?: string | null;
  direction: string;
  type: string | null;
  forcedType: string | null;
  verify: boolean;
  entities: OtherEntity[];
}): RecipientResult {
  const entity = opts.vat ? opts.entities.find((e) => sameVat(e.nif, opts.vat)) ?? null : null;
  if (opts.forcedType === "outra_entidade") return { other: true, verify: false, entity };
  // A person's own type choice wins; documents the firm issued name the client.
  if (opts.forcedType) return { other: false, verify: false, entity: null };
  if (!opts.vat || !opts.own.vat) return { other: false, verify: false, entity: null };
  if (opts.direction === "issued" || opts.type === "fatura_emitida") return { other: false, verify: false, entity: null };
  if ((opts.sellerVat && sameVat(opts.sellerVat, opts.own.vat)) || mentionsFirm(opts.sellerName ?? null, opts.own.name)) {
    return { other: false, verify: false, entity: null };
  }
  if (sameVat(opts.vat, opts.own.vat) || mentionsFirm(opts.name, opts.own.name)) {
    return { other: false, verify: false, entity: null };
  }
  return { other: true, verify: opts.verify, entity };
}

/** Queue columns for a document addressed to another entity. */
export function otherEntityColumns(r: RecipientResult): Record<string, unknown> {
  const action = r.entity?.action ?? null;
  const settle = !r.verify;
  return {
    intake_type: "outra_entidade",
    doc_type: "unknown",
    intake_route: r.verify ? "triage" : action === "ignore" ? "ignored" : "other_entity",
    other_entity_id: r.entity?.id ?? null,
    other_entity_action: action,
    payment_match_document_id: null,
    payment_match_candidates: null,
    matched_bank_account_id: null,
    bank_period: null,
    credit_note_original_document_id: null,
    is_recurring_candidate: false,
    ...(settle && action === "archive" ? { status: "filed", filed_at: new Date().toISOString() } : {}),
  };
}

/** Forward an "outra_entidade" document by email (a 14-day download link). */
export async function forwardOtherEntityItem(queueItemId: string, to: string, by: string | null = null) {
  const { data: row } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("id, status, source_bucket, source_file_url, original_filename, extracted_recipient_name, extracted_recipient_vat, extracted_seller_name, extracted_date")
    .eq("id", queueItemId)
    .maybeSingle();
  if (!row?.source_file_url) return { ok: false, error: "no file" };
  try {
    const { data: signed, error } = await supabaseAdmin.storage
      .from(row.source_bucket ?? "financial-documents")
      .createSignedUrl(row.source_file_url, 14 * 24 * 3600);
    if (error || !signed) throw new Error(error?.message ?? "no link");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("finance-forward", to, {
      idempotencyKey: `finance-forward-${row.id}-${to}`,
      templateData: {
        entityName: row.extracted_recipient_name,
        entityNif: row.extracted_recipient_vat,
        issuer: row.extracted_seller_name,
        date: row.extracted_date,
        filename: row.original_filename,
        link: signed.signedUrl,
      },
    });
    await supabaseAdmin
      .from("financial_document_review_queue")
      .update({
        forwarded_to: to,
        forwarded_at: new Date().toISOString(),
        forward_error: null,
        ...(row.status === "pending_review"
          ? { status: "filed" as const, filed_at: new Date().toISOString(), reviewed_by: by, reviewed_at: by ? new Date().toISOString() : null }
          : {}),
      })
      .eq("id", row.id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from("financial_document_review_queue").update({ forward_error: msg }).eq("id", row.id);
    return { ok: false, error: msg };
  }
}
