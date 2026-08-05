/**
 * D3 — Document classification core (server-only helpers).
 *
 * Extraction runs through the Lovable AI Gateway (same pattern as
 * `purchase-ocr.functions.ts` / `benefit-ocr.functions.ts`). On top of the
 * purchase-invoice extraction we also ask for:
 *   - document type (invoice / receipt / proof_of_payment / unknown)
 *   - a suggested accounting classification code, chosen ONLY from the
 *     existing `financial_classifications` taxonomy (never invented)
 *
 * Supplier matching is VAT/NIF-only — never by name (names drift).
 *
 * Nothing here writes to live financial tables: results are persisted into
 * `financial_document_review_queue` for human approval.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePortugueseNif } from "@/lib/finance/nif";

const MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type IntakeDocType =
  | "invoice"
  | "receipt"
  | "proof_of_payment"
  | "bank_statement"
  | "unknown";

export type IntakeDirection = "issued" | "received" | "unclear";

export type IntakeExtraction = {
  doc_type: IntakeDocType;
  doc_type_confidence: number;
  supplier_name: string | null;
  supplier_vat: string | null;
  /** Seller / issuer of the document (may be the firm itself). */
  seller_name: string | null;
  seller_vat: string | null;
  /** Buyer / bill-to party (may be the firm itself). */
  buyer_name: string | null;
  buyer_vat: string | null;
  /**
   * The issuer's mandatory legal footer block (NIF / Capital Social / C.R.C.).
   * On Portuguese invoices this — not page position — identifies the issuer.
   */
  footer_legal_text: string | null;
  /** Every VAT/NIF printed anywhere on the page, in printed order. */
  all_vat_numbers: string[] | null;
  document_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  total_amount: number | null;
  vat_amount: number | null;
  amount_ex_vat: number | null;
  classification_code: string | null;
  classification_confidence: number;
  summary: string | null;
  /** How the document says it was paid, when stated. */
  payment_method: "card" | "cash" | "bank_transfer" | "direct_debit" | "not_stated" | null;
  /** Last 4 digits of the card used, when printed. */
  card_last4: string | null;
  /** Balance still due per the document itself (0 = already settled). */
  balance_due: number | null;
};



const JSON_SCHEMA = {
  name: "financial_document_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      doc_type: {
        type: "string",
        enum: ["invoice", "receipt", "proof_of_payment", "bank_statement", "unknown"],
      },
      doc_type_confidence: { type: "number" },
      supplier_name: { type: ["string", "null"] },
      supplier_vat: { type: ["string", "null"] },
      seller_name: { type: ["string", "null"] },
      seller_vat: { type: ["string", "null"] },
      buyer_name: { type: ["string", "null"] },
      buyer_vat: { type: ["string", "null"] },
      footer_legal_text: { type: ["string", "null"] },
      all_vat_numbers: { type: ["array", "null"], items: { type: "string" } },
      document_number: { type: ["string", "null"] },
      issue_date: { type: ["string", "null"] },
      due_date: { type: ["string", "null"] },
      currency: { type: ["string", "null"] },
      total_amount: { type: ["number", "null"] },
      vat_amount: { type: ["number", "null"] },
      amount_ex_vat: { type: ["number", "null"] },
      classification_code: { type: ["string", "null"] },
      classification_confidence: { type: "number" },
      summary: { type: ["string", "null"] },
      payment_method: {
        type: ["string", "null"],
        enum: ["card", "cash", "bank_transfer", "direct_debit", "not_stated", null],
      },
      card_last4: { type: ["string", "null"] },
      balance_due: { type: ["number", "null"] },
    },
    required: [
      "doc_type", "doc_type_confidence", "supplier_name", "supplier_vat",
      "seller_name", "seller_vat", "buyer_name", "buyer_vat",
      "footer_legal_text", "all_vat_numbers",
      "document_number", "issue_date", "due_date", "currency", "total_amount",
      "vat_amount", "amount_ex_vat", "classification_code",
      "classification_confidence", "summary",
      "payment_method", "card_last4", "balance_due",

    ],

  },
} as const;

function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "heic": return "image/heic";
    case "heif": return "image/heif";
    default: return "image/jpeg";
  }
}

export async function loadClassificationCatalog() {
  const { data } = await supabaseAdmin
    .from("financial_classifications")
    .select("id, code, name_en, name_pt, active")
    .eq("active", true)
    .order("code");
  return (data ?? []) as Array<{
    id: string; code: string; name_en: string; name_pt: string; active: boolean;
  }>;
}

export async function extractDocument(
  bucket: string,
  storagePath: string,
): Promise<{ ok: true; extraction: IntakeExtraction; raw: unknown } | { ok: false; error: string }> {
  const { data: file, error: dlErr } = await supabaseAdmin.storage.from(bucket).download(storagePath);
  if (dlErr || !file) return { ok: false, error: `download: ${dlErr?.message ?? "no file"}` };

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || guessMime(storagePath);
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { ok: false, error: "LOVABLE_API_KEY missing" };

  const catalog = await loadClassificationCatalog();
  const catalogText = catalog.map((c) => `${c.code} — ${c.name_en}`).join("\n");
  const own = await getOwnCompanyVat();

  const system = `You classify and extract structured data from financial documents (invoices, receipts, proofs of payment, bank statements) handled by an architecture firm in Portugal. Documents may be Portuguese or English.

THE FIRM ITSELF (the entity whose accounting this is):
- Registered name: ${own.name ?? "Pedra Silva Arquitecto Lda"} (also printed as "Pedra Silva Architects", "Pedra Silva Arquitectos", "Pedra Silva Arquitetos")
- NIF / VAT: ${own.vat ?? "unknown"}
The firm can appear as EITHER the seller (an invoice it issued to a client) OR the buyer (a supplier invoice it received). Decide from the document, never assume.

Rules:
- FIRST decide doc_type: "bank_statement" (a bank/credit-card account statement or combined extract listing many transactions over a period — e.g. "extrato", "extrato combinado", "account statement"; it has NO single seller and NO single invoice total), "invoice" (a single amount owed to one seller), "receipt" (payment confirmation / paid receipt for a single purchase), "proof_of_payment" (bank transfer confirmation or payment slip for a single payment), otherwise "unknown".
- If doc_type is "bank_statement": set supplier_name, supplier_vat and classification_code to null. The bank is NOT a supplier. Statements are handled by the banking import, not by supplier classification.
- ALWAYS extract BOTH parties of an invoice/receipt separately:
  - seller_name / seller_vat: the party ISSUING the document (the one being paid), exactly as printed, including any country prefix (e.g. IE4276970QH, PT501234567).
  - buyer_name / buyer_vat: the party the document is BILLED TO (the one paying). Look for "Cliente", "Bill to", "Adquirente", "Exmos. Srs.", "Contribuinte n.º".
  - Never swap them and never leave a VAT blank when it is printed anywhere on the document.
- IDENTIFYING THE ISSUER ON A PORTUGUESE INVOICE — do NOT use page position:
  - The issuer is the entity in the mandatory legal footer block: the line(s) carrying "NIF"/"Contribuinte", "Capital Social" and "C.R.C."/"Matriculada na Conservatória". That footer identifies the SELLER, even when the letterhead is only a logo and even when another company's details sit at the top of the page next to the invoice number/date.
  - A company name/address printed beside the invoice number, date or "Fatura" metadata block is normally the BUYER (bill-to), not the seller.
  - Copy that whole footer legal block verbatim into footer_legal_text (null if the document has none).
- all_vat_numbers: list EVERY VAT/NIF printed anywhere on the page (header, party blocks, footer legal block), exactly as printed, in the order they appear. Never omit one because you were unsure whose it is.
- supplier_vat / supplier_name: keep these equal to seller_vat / seller_name (legacy fields).
- For bank_statement / proof_of_payment where there is no clear seller/buyer pair, set the party fields to null rather than guessing.
- document_number: the invoice or receipt number as printed.
- issue_date / due_date: ISO YYYY-MM-DD.
- Amounts numeric, decimal point, no currency symbol. currency as ISO code (EUR, USD...).
- classification_code: pick the single best matching code from the taxonomy below. Use the code string EXACTLY. Never invent a code. null if nothing fits.
- payment_method: how the document says it was paid — "card" (cartão, Visa, Mastercard, MB Way card, credit/debit card, prepaid card), "cash" (numerário, dinheiro), "bank_transfer" (transferência bancária, wire, IBAN reference), "direct_debit" (débito directo), or "not_stated" when the document says nothing. Never guess from the supplier type.
- card_last4: the last 4 digits of the card, when printed (e.g. "**** 4821" → "4821"). null otherwise.
- balance_due: the amount STILL OWED per the document itself — "Saldo", "Balance due", "Valor em dívida", "Total a pagar". If the document shows it already settled ("Balance due: 0,00", "Pago", "Paid", "Recibo"/receipt for the full amount, "Liquidado", "Total pago"), set balance_due to 0. If no such field or wording exists anywhere, set it to null (do NOT infer it from the total).
- confidences are 0..1, be honest.



TAXONOMY:
${catalogText}`;


  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the document fields per the schema." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    if (res.status === 429) return { ok: false, error: "AI rate limit reached, please retry shortly (429)" };
    if (res.status === 402) return { ok: false, error: "AI credits exhausted (402)" };
    return { ok: false, error: `gateway ${res.status}: ${rawText.slice(0, 300)}` };
  }

  let rawJson: unknown;
  try { rawJson = JSON.parse(rawText); } catch { return { ok: false, error: "invalid JSON from gateway" }; }
  const content = (rawJson as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
  if (!content) return { ok: false, error: "empty model content" };

  let parsed: IntakeExtraction;
  try { parsed = JSON.parse(content) as IntakeExtraction; } catch { return { ok: false, error: "model output not JSON" }; }

  return { ok: true, extraction: parsed, raw: rawJson };
}

/** Normalize any VAT id for comparison: uppercase, strip non-alphanumerics. */
export function normalizeVat(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return v.length === 0 ? null : v;
}

/** Every comparable form of a VAT id (with/without country prefix, PT digits). */
function vatForms(raw: string | null | undefined): Set<string> {
  const out = new Set<string>();
  const v = normalizeVat(raw);
  if (v) {
    out.add(v);
    if (/^[A-Z]{2}/.test(v)) out.add(v.slice(2));
  }
  const pt = normalizePortugueseNif(raw);
  if (pt) out.add(pt);
  return out;
}

/** True when two VAT ids refer to the same entity, ignoring country prefixes. */
export function sameVat(a: string | null | undefined, b: string | null | undefined): boolean {
  const fa = vatForms(a);
  if (fa.size === 0) return false;
  for (const f of vatForms(b)) if (fa.has(f)) return true;
  return false;
}

/**
 * The firm's own VAT — canonical source is `pm_invoice_settings.company_nif`
 * (same row the invoicing module and `own-company.functions.ts` read).
 * Never hard-code it here.
 */
export async function getOwnCompanyVat(): Promise<{ vat: string | null; name: string | null }> {
  const { data } = await supabaseAdmin
    .from("pm_invoice_settings")
    .select("company_nif, company_name, singleton")
    .order("singleton", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { vat: data?.company_nif ?? null, name: data?.company_name ?? null };
}

export type DirectionResult = {
  direction: "issued" | "received" | "unclear";
  /** The other party: the client for issued docs, the supplier for received ones. */
  counterparty_name: string | null;
  counterparty_vat: string | null;
  /** 0..1 — how strong the anchor was. */
  confidence: number;
  /** Which signal decided it (debugging / reviewer transparency). */
  anchor:
    | "seller_vat"
    | "buyer_vat"
    | "seller_name"
    | "buyer_name"
    | "footer_legal"
    | "no_firm_reference"
    | "none";
};

/** Strip accents, punctuation and legal/profession words for fuzzy name matching. */
const NAME_NOISE =
  /\b(lda|ltda|unipessoal|sa|s\.a|societe|limited|ltd|inc|llc|arquitecto|arquitectos|arquiteto|arquitetos|architect|architects|architecture|arquitectura|arquitetura|company|co)\b/g;

export function firmNameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  const cleaned = String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(NAME_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ").filter((t) => t.length > 2);
}

/**
 * Fuzzy "is this text the firm?" — true when every distinctive token of the
 * firm's registered name appears in the candidate text. Tolerates the
 * Architects / Arquitectos / Arquitetos spellings and legal-suffix drift.
 */
export function mentionsFirm(text: string | null | undefined, ownName: string | null): boolean {
  const tokens = firmNameTokens(ownName);
  if (tokens.length === 0 || !text) return false;
  const hay = ` ${firmNameTokens(text).join(" ")} `;
  return tokens.every((t) => hay.includes(` ${t} `));
}

/**
 * Direction detection: whose document is this?
 *
 * Anchors, strongest first:
 *  1. seller VAT == firm VAT  → issued   (counterparty = CLIENT)
 *  2. buyer VAT  == firm VAT  → received (counterparty = SUPPLIER)
 *  3. seller/buyer NAME matches the firm's registered name — VAT extraction
 *     fails on some templates, so name is a real secondary anchor.
 *  4. The mandatory legal footer block (NIF / Capital Social / C.R.C.) belongs
 *     to the firm → the firm ISSUED it. On a Portuguese invoice that footer,
 *     not page position, identifies the issuer.
 *  5. The firm is referenced somewhere on the page (any printed VAT / footer)
 *     but no party role can be resolved → "unclear", never a silent default.
 *  6. The firm is not referenced at all → an ordinary received supplier
 *     document (low confidence, reviewer confirms).
 */
export function detectDirection(
  own: { vat: string | null; name: string | null } | string | null,
  ex: Pick<
    IntakeExtraction,
    "seller_name" | "seller_vat" | "buyer_name" | "buyer_vat" | "supplier_name" | "supplier_vat"
  > &
    Partial<Pick<IntakeExtraction, "footer_legal_text" | "all_vat_numbers">>,
): DirectionResult {
  const ownVat = typeof own === "string" || own === null ? own : own.vat;
  const ownName = typeof own === "string" || own === null ? null : own.name;

  const sellerVat = ex.seller_vat ?? ex.supplier_vat ?? null;
  const sellerName = ex.seller_name ?? ex.supplier_name ?? null;
  const issued = (c: DirectionResult["anchor"], confidence: number): DirectionResult => ({
    direction: "issued",
    counterparty_name: ex.buyer_name,
    counterparty_vat: ex.buyer_vat,
    confidence,
    anchor: c,
  });
  const received = (c: DirectionResult["anchor"], confidence: number): DirectionResult => ({
    direction: "received",
    counterparty_name: sellerName,
    counterparty_vat: sellerVat,
    confidence,
    anchor: c,
  });

  // 1–2: VAT anchors.
  if (ownVat && sameVat(sellerVat, ownVat)) return issued("seller_vat", 0.99);
  if (ownVat && sameVat(ex.buyer_vat, ownVat)) return received("buyer_vat", 0.99);

  // 3: name anchors (VAT extraction can fail per-template).
  const sellerIsFirm = mentionsFirm(sellerName, ownName);
  const buyerIsFirm = mentionsFirm(ex.buyer_name, ownName);
  if (sellerIsFirm && !buyerIsFirm) return issued("seller_name", 0.85);
  if (buyerIsFirm && !sellerIsFirm) return received("buyer_name", 0.85);

  // 4: the legal footer block identifies the issuer.
  const footer = ex.footer_legal_text ?? null;
  const footerIsFirm =
    (!!ownVat && !!footer && sameVatInText(footer, ownVat)) || mentionsFirm(footer, ownName);
  if (footerIsFirm) {
    // The firm issued it; the other printed party is the client.
    const counterpartyName = ex.buyer_name ?? (sellerIsFirm ? null : sellerName);
    const counterpartyVat = ex.buyer_vat ?? (sellerIsFirm ? null : sellerVat);
    return {
      direction: "issued",
      counterparty_name: counterpartyName,
      counterparty_vat: counterpartyVat,
      confidence: 0.8,
      anchor: "footer_legal",
    };
  }

  // 5: the firm is referenced but its role is not resolvable → flag it.
  const printedVats = ex.all_vat_numbers ?? [];
  const firmReferenced =
    (!!ownVat && printedVats.some((v) => sameVat(v, ownVat))) ||
    (!!ownVat && !!footer && sameVatInText(footer, ownVat)) ||
    mentionsFirm(footer, ownName) ||
    sellerIsFirm ||
    buyerIsFirm;
  if (firmReferenced || !ownVat) {
    return {
      direction: "unclear",
      counterparty_name: sellerName,
      counterparty_vat: sellerVat,
      confidence: 0.3,
      anchor: "none",
    };
  }

  // 6: no reference to the firm anywhere — ordinary inbound supplier document.
  return received("no_firm_reference", 0.6);
}

/** True when a VAT id appears anywhere inside a free-text block. */
function sameVatInText(text: string | null, vat: string | null): boolean {
  if (!text || !vat) return false;
  const digits = String(text).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  for (const form of vatForms(vat)) if (form.length >= 8 && digits.includes(form)) return true;
  return false;
}


/**
 * Supplier matching — VAT/NIF ONLY, never by name.
 * Compares both the raw normalized VAT and the Portuguese-normalized digits.
 */
export async function matchSupplierByVat(rawVat: string | null): Promise<{
  status: "matched" | "no_match" | "ambiguous";
  matched_supplier_id: string | null;
  ambiguous_ids: string[];
}> {
  const vat = normalizeVat(rawVat);
  if (!vat) return { status: "no_match", matched_supplier_id: null, ambiguous_ids: [] };

  const ptDigits = normalizePortugueseNif(rawVat);
  const candidates = new Set<string>([vat]);
  if (ptDigits) candidates.add(ptDigits);
  if (vat.startsWith("PT")) candidates.add(vat.slice(2));

  const { data } = await supabaseAdmin
    .from("companies")
    .select("id, nif")
    .not("nif", "is", null);

  const hits = ((data ?? []) as Array<{ id: string; nif: string | null }>).filter((c) => {
    const n = normalizeVat(c.nif);
    if (!n) return false;
    return candidates.has(n) || (n.startsWith("PT") && candidates.has(n.slice(2)));
  });

  if (hits.length === 1) return { status: "matched", matched_supplier_id: hits[0].id, ambiguous_ids: [] };
  if (hits.length > 1) {
    return { status: "ambiguous", matched_supplier_id: null, ambiguous_ids: hits.map((h) => h.id) };
  }
  return { status: "no_match", matched_supplier_id: null, ambiguous_ids: [] };
}

/**
 * Recurring detection: same supplier VAT + near-identical amount (±2%) on a
 * previously APPROVED queue row roughly a month or more earlier.
 * Never auto-files — only flags and reuses the previous classification.
 */
export async function detectRecurring(vat: string | null, amount: number | null): Promise<{
  is_recurring_candidate: boolean;
  reference_id: string | null;
  classification_id: string | null;
}> {
  const nv = normalizeVat(vat);
  if (!nv || amount == null) {
    return { is_recurring_candidate: false, reference_id: null, classification_id: null };
  }
  const { data } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("id, extracted_amount, extracted_supplier_vat, suggested_classification_id, extracted_date, status")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(200);

  const prior = ((data ?? []) as Array<{
    id: string; extracted_amount: number | null; extracted_supplier_vat: string | null;
    suggested_classification_id: string | null;
  }>).find((r) => {
    if (normalizeVat(r.extracted_supplier_vat) !== nv) return false;
    const a = Number(r.extracted_amount ?? NaN);
    if (!Number.isFinite(a) || a === 0) return false;
    return Math.abs(a - amount) / Math.abs(a) <= 0.02;
  });

  if (!prior) return { is_recurring_candidate: false, reference_id: null, classification_id: null };
  return {
    is_recurring_candidate: true,
    reference_id: prior.id,
    classification_id: prior.suggested_classification_id ?? null,
  };
}

/**
 * Document pairing across the WHOLE queue (not just the current upload batch).
 *
 * Two passes:
 *   1. exact document-number match (invoice + its receipt reusing the number),
 *      restricted to the same supplier VAT when both sides have one;
 *   2. fallback for issuers that number receipts differently from invoices
 *      (e.g. Anthropic): same supplier (VAT, else normalized name) + same
 *      amount (±1 cent or ±0.5%) + issue dates within 45 days.
 */
export async function resolveDocumentGroup(
  documentNumber: string | null,
  vat: string | null,
  opts?: { amount?: number | null; date?: string | null; supplierName?: string | null },
): Promise<string | null> {
  const nv = normalizeVat(vat);
  const num = documentNumber?.trim() || null;
  const amount = opts?.amount ?? null;
  const name = opts?.supplierName?.trim().toLowerCase() || null;

  const { data } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select(
      "id, linked_document_group_id, extracted_document_number, extracted_supplier_vat, extracted_supplier_name, extracted_amount, extracted_date, doc_type",
    )
    .neq("status", "rejected")
    .neq("doc_type", "bank_statement")
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as Array<{
    linked_document_group_id: string;
    extracted_document_number: string | null;
    extracted_supplier_vat: string | null;
    extracted_supplier_name: string | null;
    extracted_amount: number | null;
    extracted_date: string | null;
  }>;

  const sameSupplier = (r: (typeof rows)[number]) => {
    const rv = normalizeVat(r.extracted_supplier_vat);
    if (nv && rv) return nv === rv;
    if (name && r.extracted_supplier_name) {
      return r.extracted_supplier_name.trim().toLowerCase() === name;
    }
    return false;
  };

  // Pass 1 — same document number.
  if (num) {
    const byNumber = rows.find(
      (r) =>
        r.extracted_document_number?.trim() === num &&
        (!nv || !r.extracted_supplier_vat || normalizeVat(r.extracted_supplier_vat) === nv),
    );
    if (byNumber) return byNumber.linked_document_group_id;
  }

  // Pass 2 — same supplier + same amount + nearby dates.
  if (amount != null && Number.isFinite(amount) && amount !== 0) {
    const ts = opts?.date ? Date.parse(`${opts.date}T00:00:00Z`) : NaN;
    const byAmount = rows.find((r) => {
      if (!sameSupplier(r)) return false;
      const a = Number(r.extracted_amount ?? NaN);
      if (!Number.isFinite(a)) return false;
      const diff = Math.abs(a - amount);
      if (diff > 0.01 && diff / Math.abs(amount) > 0.005) return false;
      if (Number.isNaN(ts) || !r.extracted_date) return true;
      const rt = Date.parse(`${r.extracted_date}T00:00:00Z`);
      if (Number.isNaN(rt)) return true;
      return Math.abs(rt - ts) <= 45 * 24 * 3600 * 1000;
    });
    if (byAmount) return byAmount.linked_document_group_id;
  }

  return null;
}


/**
 * Shared ingest pipeline (admin context): extract → match → recurring → group
 * → insert one `financial_document_review_queue` row.
 *
 * Used by the manual-upload server function AND by the D4 email poller, so
 * both intake paths behave identically. Writes ONLY to the review queue.
 */
export async function ingestStoredDocument(opts: {
  bucket: string;
  storagePath: string;
  originalFilename?: string | null;
  source: "manual_upload" | "email_ingestion" | "drive_folder";
  createdBy?: string | null;
  /** When set, the existing pending queue row is re-extracted in place. */
  replaceQueueItemId?: string | null;
}): Promise<{ ok: boolean; queueItemId?: string; groupId?: string; error?: string }> {
  const result = await extractDocument(opts.bucket, opts.storagePath);
  const replaceId = opts.replaceQueueItemId ?? null;

  const write = async (values: Record<string, unknown>) => {
    const q = supabaseAdmin.from("financial_document_review_queue");
    return replaceId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? q.update(values as any).eq("id", replaceId).select("id, linked_document_group_id").single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : q.insert(values as any).select("id, linked_document_group_id").single();
  };

  const base = {
    source_file_url: opts.storagePath,
    source_bucket: opts.bucket,
    original_filename: opts.originalFilename ?? null,
    source: opts.source,
    created_by: opts.createdBy ?? null,
  };

  if (!result.ok) {
    const { data: row, error } = await write({ ...base, extraction_error: result.error });
    if (error || !row) return { ok: false, error: error?.message ?? result.error };
    return {
      ok: false,
      error: result.error,
      queueItemId: row.id,
      groupId: row.linked_document_group_id,
    };
  }


  const ex = result.extraction;

  // Routing step: bank statements never go through supplier matching or
  // accounting classification — they belong to the Banking import path.
  const isStatement = ex.doc_type === "bank_statement";

  // Direction step: is this a document we RECEIVED (payable) or one we
  // ISSUED to a client (receivable)? Anchored on the firm's own VAT, its
  // registered name, and the issuer's legal footer block.
  const own = await getOwnCompanyVat();
  const dir: DirectionResult = isStatement
    ? {
        direction: "received",
        counterparty_name: null,
        counterparty_vat: null,
        confidence: 1,
        anchor: "none",
      }
    : detectDirection(own, ex);

  const isIssued = dir.direction === "issued";

  const catalog = isStatement ? [] : await loadClassificationCatalog();
  const suggested =
    !isStatement && ex.classification_code
      ? catalog.find(
          (c) => c.code.toLowerCase() === ex.classification_code!.trim().toLowerCase(),
        ) ?? null
      : null;

  // The counterparty VAT drives matching: supplier for received, client for issued.
  const counterpartyVat = isStatement ? null : dir.counterparty_vat;
  const counterpartyName = isStatement ? null : dir.counterparty_name;

  const match = isStatement
    ? { status: "no_match" as const, matched_supplier_id: null, ambiguous_ids: [] as string[] }
    : await matchSupplierByVat(counterpartyVat);
  const recurring = isStatement || isIssued
    ? { is_recurring_candidate: false, reference_id: null, classification_id: null }
    : await detectRecurring(counterpartyVat, ex.total_amount);
  const groupId = isStatement
    ? null
    : await resolveDocumentGroup(ex.document_number, counterpartyVat, {
        amount: ex.total_amount,
        date: ex.issue_date,
        supplierName: counterpartyName,
      });

  const payload: Record<string, unknown> = {
    ...base,
    raw_extraction: result.raw as object,
    doc_type: ex.doc_type ?? "unknown",
    doc_type_confidence: ex.doc_type_confidence ?? null,
    direction: dir.direction,
    direction_confidence: dir.confidence,

    extracted_seller_name: isStatement ? null : ex.seller_name ?? ex.supplier_name,
    extracted_seller_vat: isStatement ? null : ex.seller_vat ?? ex.supplier_vat,
    extracted_buyer_name: isStatement ? null : ex.buyer_name,
    extracted_buyer_vat: isStatement ? null : ex.buyer_vat,
    extracted_amount: isStatement ? null : ex.total_amount,
    extracted_vat_amount: isStatement ? null : ex.vat_amount,
    extracted_date: ex.issue_date,
    extracted_due_date: isStatement ? null : ex.due_date,
    extracted_currency: ex.currency ?? "EUR",
    extracted_document_number: ex.document_number,
    // Legacy supplier columns stay populated ONLY for received documents so
    // an issued client invoice can never leak into the suppliers workflow.
    extracted_supplier_name: isStatement || isIssued ? null : counterpartyName,
    extracted_supplier_vat: isStatement || isIssued ? null : counterpartyVat,
    supplier_match_status: isIssued ? "no_match" : match.status,
    matched_supplier_id: isIssued ? null : match.matched_supplier_id,
    ambiguous_supplier_ids: isIssued ? [] : match.ambiguous_ids,
    client_match_status: isIssued ? match.status : "no_match",
    matched_client_id: isIssued ? match.matched_supplier_id : null,
    ambiguous_client_ids: isIssued ? match.ambiguous_ids : [],
    
    suggested_classification_id: recurring.classification_id ?? suggested?.id ?? null,
    suggested_classification_code: suggested?.code ?? (isStatement ? null : ex.classification_code) ?? null,
    classification_confidence: isStatement ? null : ex.classification_confidence ?? null,
    is_recurring_candidate: recurring.is_recurring_candidate,
    recurring_reference_id: recurring.reference_id,
    extraction_error: null,
  };

  if (groupId) payload.linked_document_group_id = groupId;

  const { data: row, error } = await write(payload);
  if (error || !row) return { ok: false, error: error?.message ?? "write failed" };
  return { ok: true, queueItemId: row.id, groupId: row.linked_document_group_id };
}

/**
 * Re-run extraction + direction detection on an existing PENDING queue row,
 * updating it in place. Approved/rejected rows are never touched — a wrong
 * direction that already produced a live financial record needs manual review.
 */
export async function reprocessQueueItem(
  queueItemId: string,
): Promise<{ ok: boolean; queueItemId?: string; error?: string }> {
  const { data: item, error } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("id, status, source, source_bucket, source_file_url, original_filename, created_by")
    .eq("id", queueItemId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!item) return { ok: false, error: "queue item not found" };
  if (item.status !== "pending_review") {
    return { ok: false, error: `cannot reprocess a ${item.status} item` };
  }
  if (!item.source_file_url) return { ok: false, error: "queue item has no stored file" };

  return ingestStoredDocument({
    bucket: item.source_bucket ?? "financial-documents",
    storagePath: item.source_file_url,
    originalFilename: item.original_filename,
    source: (item.source as "manual_upload" | "email_ingestion" | "drive_folder") ?? "manual_upload",
    createdBy: item.created_by,
    replaceQueueItemId: item.id,
  });
}

