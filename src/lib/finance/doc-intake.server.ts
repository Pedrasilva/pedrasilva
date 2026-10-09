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
import { PSA_ENTITY_ID } from "@/lib/finance/entity";

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
  /** The payment line copied verbatim ("Forma de pagamento: MasterCard ****0223"). */
  payment_method_raw: string | null;
  /** Balance still due per the document itself (0 = already settled). */
  balance_due: number | null;
  /**
   * IRS withheld at source ("Retenção na fonte IRS") on Portuguese
   * Fatura-Recibo / recibos verdes. NOT VAT — a separate liability owed to AT.
   */
  withholding_tax_amount: number | null;
  /** "Total a pagar" — the amount actually transferred to the supplier. */
  total_payable: number | null;
  /**
   * Itemised invoice lines, when the document prints a line table. Used by the
   * Finance → Inventory intake so each physical item can become an asset.
   */
  line_items: Array<{
    description: string;
    quantity: number | null;
    unit_price_ex_vat: number | null;
    amount_ex_vat: number | null;
    vat_rate: number | null;
    is_physical_item: boolean;
  }> | null;
};


/**
 * Pull the trailing 4 digits of a masked card number out of any string,
 * regardless of brand prefix, mask character or mask length.
 * "MasterCard ************0223" -> "0223"; "•••• 0223" -> "0223";
 * "terminado em 223" -> null (fewer than 4 digits is not a valid last-4).
 */
export function parseCardLast4(
  raw: string | null | undefined,
  opts: { maskedOnly?: boolean } = {},
): string | null {
  if (!raw) return null;
  const s = String(raw);
  // Prefer a run of 4 digits that follows a mask/separator/keyword.
  const masked = s.match(
    /(?:[*x•·#\u2022\u00b7]{2,}|ending\s+in|ending|terminad[oa]\s+(?:em|en)|final(?:izado)?\s+em|últimos?\s+\d?\s*d[íi]gitos?)[\s\-–—:.]*?(\d{4})(?!\d)/i,
  );
  if (masked?.[1]) return masked[1];
  // A free-text line ("Forma de pagamento: débito directo — 2026/01") has no
  // card in it; only fall back to a bare 4-digit group when explicitly allowed.
  if (opts.maskedOnly) return null;
  const groups = s.match(/(?<!\d)\d{4}(?!\d)/g);
  return groups?.length ? groups[groups.length - 1]! : null;
}

type PaymentMethod = "card" | "cash" | "bank_transfer" | "direct_debit" | "not_stated";

/** Infer the payment method from the verbatim payment line (EN / PT / ES). */
export function parsePaymentMethod(raw: string | null | undefined): PaymentMethod | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (
    /(cart[aã]o|tarjeta|\bcard\b|visa|mastercard|master\s?card|maestro|amex|american express|multibanco|mb\s?way|d[ée]bito autom|credit|debit|pre-?paid|pr[eé]-?pago|[*x•·]{2,}\s*\d{4})/i.test(s)
  ) {
    // "débito directo"/"domiciliación" is a distinct method, check it first.
    if (/(d[ée]bito\s+(directo|direto|autom[aá]tico)|direct\s+debit|domiciliaci[oó]n)/i.test(s))
      return "direct_debit";
    return "card";
  }
  if (/(d[ée]bito\s+(directo|direto|autom[aá]tico)|direct\s+debit|domiciliaci[oó]n)/i.test(s))
    return "direct_debit";
  if (/(transfer[eê]ncia|transferencia|wire|bank\s+transfer|iban|swift)/i.test(s))
    return "bank_transfer";
  if (/(numer[aá]rio|dinheiro|efectivo|efetivo|\bcash\b|contado)/i.test(s)) return "cash";
  return null;
}


export const JSON_SCHEMA = {
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
      payment_method_raw: { type: ["string", "null"] },
      balance_due: { type: ["number", "null"] },
      withholding_tax_amount: { type: ["number", "null"] },
      total_payable: { type: ["number", "null"] },
      line_items: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            description: { type: "string" },
            quantity: { type: ["number", "null"] },
            unit_price_ex_vat: { type: ["number", "null"] },
            amount_ex_vat: { type: ["number", "null"] },
            vat_rate: { type: ["number", "null"] },
            is_physical_item: { type: "boolean" },
          },
          required: [
            "description", "quantity", "unit_price_ex_vat",
            "amount_ex_vat", "vat_rate", "is_physical_item",
          ],
        },
      },
    },
    required: [
      "doc_type", "doc_type_confidence", "supplier_name", "supplier_vat",
      "seller_name", "seller_vat", "buyer_name", "buyer_vat",
      "footer_legal_text", "all_vat_numbers",
      "document_number", "issue_date", "due_date", "currency", "total_amount",
      "vat_amount", "amount_ex_vat", "classification_code",
      "classification_confidence", "summary",
      "payment_method", "card_last4", "payment_method_raw", "balance_due",
      "withholding_tax_amount", "total_payable", "line_items",



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

export async function loadClassificationCatalog(entityId: string = PSA_ENTITY_ID) {
  const { data } = await supabaseAdmin
    .from("financial_classifications")
    .select("id, code, name_en, name_pt, active")
    .eq("entity_id", entityId)
    .eq("active", true)
    .order("code");
  return (data ?? []) as Array<{
    id: string; code: string; name_en: string; name_pt: string; active: boolean;
  }>;
}

/**
 * Catalogue text for the AI. The reader does not yet know which entity the
 * document belongs to, so every other active entity's CATEGORY codes are
 * listed with its name/NIF; after routing, the code is looked up only in the
 * routed entity's own catalogue (a code from another entity never matches).
 */
export async function buildCatalogText(entityId: string = PSA_ENTITY_ID): Promise<string> {
  const base = (await loadClassificationCatalog(entityId)).map((c) => `${c.code} — ${c.name_en}`).join("\n");
  const { data: ents } = await supabaseAdmin.from("finance_entities").select("id, name, nif").eq("active", true).neq("id", entityId);
  const parts: string[] = [base];
  for (const e of ents ?? []) {
    const { data } = await supabaseAdmin
      .from("financial_classifications")
      .select("code, name_en, name_pt")
      .eq("entity_id", e.id).eq("active", true).eq("level", "category").order("sort_order");
    if (!data?.length) continue;
    parts.push(`\nIf the document's recipient / buyer / payer is ${e.name} (NIF ${e.nif ?? "?"}) instead, use ONLY these codes (always a category):\n` +
      data.map((c) => `${c.code} — ${c.name_en} (${c.name_pt})`).join("\n"));
  }
  return parts.join("\n");
}

/** Shared extraction instructions (used by the single-model path and the dual-model intake). */
export function buildExtractionSystemPrompt(
  own: { vat: string | null; name: string | null },
  catalogText: string,
): string {
  return `You classify and extract structured data from financial documents (invoices, receipts, proofs of payment, bank statements) handled by an architecture firm in Portugal. Documents may be Portuguese or English.

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
- PAYMENT FIELD — the label may be in English, Portuguese or Spanish. Scan the whole document, including the labelled key-value block that also holds the invoice date/currency, for ANY of: "Payment method", "Payment type", "Paid with", "Paid by", "Method of payment", "Forma de pagamento", "Modo de pagamento", "Meio de pagamento", "Pagamento", "Forma de pago", "Método de pago", "Medio de pago", "Pagado con". Also treat a bare brand + masked number line ("MasterCard ************0223", "VISA •••• 1234") as a payment field even without a label.
- payment_method_raw: copy that payment line VERBATIM, label and value together (e.g. "Forma de pagamento: MasterCard ************0223"). null only when no payment wording exists anywhere.
- payment_method: how the document says it was paid — "card" (cartão/tarjeta, Visa, Mastercard, Amex, MB Way card, credit/debit/prepaid card, any masked card number), "cash" (numerário, dinheiro, efectivo), "bank_transfer" (transferência bancária, transferencia, wire, IBAN reference), "direct_debit" (débito directo, domiciliación), or "not_stated" when the document says nothing. Never guess from the supplier type.
- card_last4: the last 4 digits of the card exactly as printed, keeping any leading zero. Take the final 4-digit run of the masked number no matter how it is masked or how long the mask is: "MasterCard ************0223" → "0223"; "**** 4821" → "4821"; "•••• 0223" → "0223"; "ending in 0223" / "terminado em 0223" / "terminada en 0223" → "0223"; "xxxx-xxxx-xxxx-0223" → "0223". Never drop a leading zero and never return fewer than 4 digits. null when no card number is printed.
- balance_due: the amount STILL OWED per the document itself — "Saldo", "Balance due", "Valor em dívida", "Total a pagar". If the document shows it already settled ("Balance due: 0,00", "Pago", "Paid", "Recibo"/receipt for the full amount, "Liquidado", "Total pago"), set balance_due to 0. If no such field or wording exists anywhere, set it to null (do NOT infer it from the total).
- IRS WITHHOLDING (Portuguese "Fatura-Recibo" / recibos verdes from freelancers ONLY):
  - Some Portuguese documents have an "IRS" section with a "Retenção na fonte IRS" (or "Retenção IRS", "Retenção na fonte") row in the totals block. ONLY when that section/row is actually printed:
    - withholding_tax_amount: the withheld IRS value as printed, as a POSITIVE number. This is NOT VAT — never copy vat_amount into it, and never derive one from the other even if they happen to be equal.
    - total_payable: the "Total a pagar" figure (= "Total do documento" minus the withholding), i.e. what is actually transferred to the freelancer.
  - total_amount stays the "Total do documento" (VAT-inclusive) figure regardless.
  - If the document has NO "IRS" / "Retenção na fonte" section (normal company invoices — Zoom, EDP, etc.), set withholding_tax_amount to null and total_payable to null. Never invent one.
- line_items: when the document prints a table of items/services, return ONE entry per printed line, in printed order. description verbatim (trimmed), quantity as printed (default 1 when a line has no quantity), unit_price_ex_vat and amount_ex_vat excluding VAT, vat_rate as a percentage number (23 for 23%). is_physical_item = true only for tangible goods that would physically arrive at the studio (computers, monitors, cameras, lenses, furniture, phones, accessories, cables); false for services, subscriptions, licences, shipping, discounts, rounding and fees. Set line_items to null when the document has no line table at all.
- confidences are 0..1, be honest.



TAXONOMY:
${catalogText}`;
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

  const system = buildExtractionSystemPrompt(own, catalogText);


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
export async function getOwnCompanyVat(entityId: string = PSA_ENTITY_ID): Promise<{ vat: string | null; name: string | null }> {
  const { loadEntityIdentity } = await import("./recipient-rule.server");
  const id = await loadEntityIdentity(entityId);
  return { vat: id.vat, name: id.name };
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
  // Never match by an invalid Portuguese NIF or a placeholder.
  const ptLike = vat.replace(/^PT/, "");
  if (/^\d{9}$/.test(ptLike) && !isValidPortugueseNif(ptLike)) {
    return { status: "no_match", matched_supplier_id: null, ambiguous_ids: [] };
  }

  const ptDigits = normalizePortugueseNif(rawVat);
  const candidates = new Set<string>([vat]);
  if (ptDigits) candidates.add(ptDigits);
  if (vat.startsWith("PT")) candidates.add(vat.slice(2));

  const { data } = await supabaseAdmin
    .from("companies")
    .select("id, nif, foreign_tax_id")
    .or("nif.not.is.null,foreign_tax_id.not.is.null");

  const hits = ((data ?? []) as Array<{ id: string; nif: string | null; foreign_tax_id: string | null }>).filter((c) => {
    for (const raw of [c.nif, c.foreign_tax_id]) {
      const n = normalizeVat(raw);
      if (!n || n.length < 5) continue;
      if (raw === c.nif && !isValidPortugueseNif(n)) continue;
      if (candidates.has(n) || (/^[A-Z]{2}/.test(n) && candidates.has(n.slice(2)))) return true;
    }
    return false;
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
export async function detectRecurring(vat: string | null, amount: number | null, entityId: string = PSA_ENTITY_ID): Promise<{
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
    .eq("entity_id", entityId)
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
  opts?: { amount?: number | null; date?: string | null; supplierName?: string | null; entityId?: string },
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
    .eq("entity_id", opts?.entityId ?? PSA_ENTITY_ID)
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
  source: "manual_upload" | "email_ingestion" | "drive_folder" | "hr_benefit";
  createdBy?: string | null;
  /** Extra queue columns written verbatim (e.g. HR benefit linkage). */
  extraFields?: Record<string, unknown>;
  /** When set, the existing pending queue row is re-extracted in place. */
  replaceQueueItemId?: string | null;
  /** Type confirmed by a person ("Reclassificar"); models extract for it. */
  forcedType?: import("./intake-models.server").IntakeType | null;
  /** Retry counter carried across automatic AI-limit retries. */
  retryCount?: number;
  /** Set on items cut out of a multi-notice PDF; they are never split again. */
  splitOf?: { fileUrl: string; part: number; first: number; last: number } | null;
  /** Sender matched a "sempre processar" rule: an AI "ignored" route goes to triage. */
  forceProcess?: boolean;
  /** Entity of the intake channel; defaults to PSA (the finance mailbox / Drive). */
  entityId?: string;
  /** Email sender address (sender-scoped instructions and supplier hints). */
  senderAddress?: string | null;
}): Promise<IngestOutcome> {
  const intake = await import("./intake-models.server");
  const dups = await import("./intake-duplicates.server");
  const learn = await import("./intake-learning.server");
  const replaceId = opts.replaceQueueItemId ?? null;

  // Existing row (re-reads): keep its age (the oldest copy is the original),
  // its sender and the supplier NIF read last time.
  let selfCreatedAt: string | null = null;
  let priorNif: string | null = null;
  let sender = opts.senderAddress?.toLowerCase() ?? null;
  // Entity of the intake channel (email / Drive = PSA mailbox) until the recipient is read.
  let channelEntity: string = opts.entityId ?? PSA_ENTITY_ID;
  if (replaceId) {
    const { data: prev } = await supabaseAdmin
      .from("financial_document_review_queue")
      .select("created_at, extracted_supplier_vat, sender_address, entity_id")
      .eq("id", replaceId)
      .maybeSingle();
    selfCreatedAt = prev?.created_at ?? null;
    priorNif = prev?.extracted_supplier_vat ?? null;
    sender = sender ?? prev?.sender_address ?? null;
    if (prev?.entity_id) channelEntity = prev.entity_id;
  }

  // A — same file: known hash → duplicate, never sent to the AI.
  let file: { b64: string; mime: string; bytes: Uint8Array } | null = null;
  try { file = await intake.loadFile(opts.bucket, opts.storagePath); } catch { file = null; }
  const hash = file ? await dups.sha256Hex(file.bytes) : null;
  if (hash && !opts.splitOf) {
    const fd = await dups.findFileDuplicate({ hash, selfId: replaceId, storagePath: opts.storagePath, createdBefore: selfCreatedAt });
    if (fd) {
      const q = supabaseAdmin.from("financial_document_review_queue");
      // A copy of a file belongs to the same entity as the original.
      const { data: orig } = fd.queueItemId
        ? await supabaseAdmin.from("financial_document_review_queue").select("entity_id").eq("id", fd.queueItemId).maybeSingle()
        : { data: null };
      const values = {
        entity_id: orig?.entity_id ?? channelEntity,
        source_file_url: opts.storagePath,
        source_bucket: opts.bucket,
        original_filename: opts.originalFilename ?? null,
        source: opts.source,
        created_by: opts.createdBy ?? null,
        ...(opts.extraFields ?? {}),
        file_sha256: hash,
        sender_address: sender,
        status: "duplicate",
        intake_route: "triage",
        verification: "none",
        duplicate_kind: fd.kind,
        duplicate_reason: fd.reason,
        duplicate_of_id: fd.queueItemId ?? null,
        duplicate_of_document_id: null,
      };
      const { data: row, error } = replaceId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await q.update(values as any).eq("id", replaceId).select("id, linked_document_group_id").single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : await q.insert(values as any).select("id, linked_document_group_id").single();
      if (error || !row) return { ok: false, error: error?.message ?? "write failed" };
      return { ok: true, queueItemId: row.id, groupId: row.linked_document_group_id, duplicate: fd };
    }
  }

  // B — studio rules, supplier pattern and recent corrections.
  const hintNif = priorNif ?? (await learn.nifHintForSender(sender, channelEntity));
  let learning = await learn.loadLearning({ nif: hintNif, sender, docId: replaceId, entityId: channelEntity });
  const result = await intake.runDualExtraction(
    opts.bucket,
    opts.storagePath,
    opts.forcedType ?? null,
    opts.splitOf && opts.splitOf.part > 0 ? { first: opts.splitOf.first, last: opts.splitOf.last } : null,
    {
      preloaded: file,
      entityId: channelEntity,
      claudeContext: learn.learningPrompt(learning),
      geminiContext: async (nif) => {
        if (learn.nifKey(nif) && learn.nifKey(nif) !== learning.nif) learning = await learn.loadLearning({ nif, sender, docId: replaceId, entityId: channelEntity });
        return learn.learningPrompt(learning);
      },
    },
  );
  const retryCount = opts.retryCount ?? 0;
  // AI-limit failures come back automatically: 30 min, 1 h, 2 h … capped at 12 h.
  const retryAt = () =>
    new Date(Date.now() + Math.min(30 * 2 ** retryCount, 720) * 60_000).toISOString();

  const write = async (values: Record<string, unknown>) => {
    const q = supabaseAdmin.from("financial_document_review_queue");
    if (!replaceId && values.entity_id == null) values = { entity_id: channelEntity, ...values };
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
    ...(opts.extraFields ?? {}),
    file_sha256: hash,
    sender_address: sender,
  };


  if (!result.ok) {
    const { data: row, error } = await write({
      ...base,
      extraction_error: result.error,
      model_runs: result.runs ? intake.summariseRuns(result.runs) : null,
      // Limit failures wait for an automatic retry instead of becoming "unknown".
      intake_route: result.retryLater ? "retry" : "triage",
      intake_type: opts.forcedType ?? null,
      intake_type_source: opts.forcedType ? "manual" : "ai",
      verification: "none",
      retry_after: result.retryLater ? retryAt() : null,
      retry_count: result.retryLater ? retryCount + 1 : retryCount,
    });
    if (error || !row) return { ok: false, error: error?.message ?? result.error };
    return {
      ok: false,
      error: result.error,
      queueItemId: row.id,
      groupId: row.linked_document_group_id,
    };
  }


  // A PDF holding several documents (e.g. bank notices) becomes one item per
  // document: each page range is stored as its own file and read separately.
  if (result.parts && !opts.splitOf) {
    return splitAndIngest(opts, result.parts);
  }
  if (opts.splitOf) {
    Object.assign(base, {
      split_of_file_url: opts.splitOf.fileUrl,
      split_part: opts.splitOf.part,
      split_page_first: opts.splitOf.first,
      split_page_last: opts.splitOf.last,
    });
  }

  const ex = result.extraction;

  // Supplier pattern: the last 2+ approved documents of this supplier agree
  // on type and code → pre-fill them (a person's own type choice wins).
  const rr = await import("./recipient-rule.server");
  const identities = await rr.loadActiveIdentities();
  const readNifRaw = ex.seller_vat ?? ex.supplier_vat ?? null;
  const readNif = readNifRaw && !identities.some((i) => i.vat && sameVat(readNifRaw, i.vat)) ? readNifRaw : null;
  if (learn.nifKey(readNif) !== learning.nif) learning = await learn.loadLearning({ nif: readNif, sender, docId: replaceId, entityId: channelEntity });
  const aiType = ex.intake_type ?? null;
  const aiCode = ex.classification_code ?? null;
  let defaultsPrefilled = false;
  if (learning.defaults && !opts.forcedType) {
    ex.intake_type = learning.defaults.intake_type as typeof ex.intake_type;
    ex.intake_type_confidence = Math.max(Number(ex.intake_type_confidence ?? 0), 0.9);
    ex.doc_type = intake.legacyDocType(ex.intake_type);
    ex.classification_code = learning.defaults.classification_code;
    defaultsPrefilled = true;
  }
  const applied = learn.appliedLearning(learning, readNif, {
    defaultsPrefilled, aiType, aiCode, recipientNif: ex.recipient_vat ?? ex.buyer_vat ?? null,
  });

  // Routing step: bank statements never go through supplier matching or
  // accounting classification — they belong to the Banking import path.
  const isStatement = ex.doc_type === "bank_statement";

  // Entity routing: the recipient / payer-beneficiary rule against EVERY
  // active entity. One match → that entity; none → PSA (Eliminados/Triagem as
  // before); several → PSA Triagem flagged "Duas entidades". A bank document
  // whose account is registered goes to that account's entity.
  const rcpCheck = (result.checks as Record<string, { status?: string; value?: unknown } | undefined>).recipient_vat;
  const rcpVat = ((rcpCheck?.value as string | null | undefined) ?? ex.recipient_vat ?? ex.buyer_vat ?? null) || null;
  const rcpName = ex.recipient_name ?? ex.buyer_name ?? null;
  let keepFlag = false;
  if (replaceId) {
    const { data: k } = await supabaseAdmin.from("financial_document_review_queue").select("keep_despite_recipient").eq("id", replaceId).maybeSingle();
    keepFlag = !!k?.keep_despite_recipient;
  }
  const sellerName = ex.seller_name ?? ex.supplier_name ?? null;
  const sellerVat = ex.seller_vat ?? ex.supplier_vat ?? null;
  const routeBase = {
    name: rcpName, vat: rcpVat, type: ex.intake_type ?? null, sellerName, sellerVat,
    forcedType: opts.forcedType ?? null, verify: rcpCheck?.status === "verify", keep: keepFlag,
    parties: [
      { name: ex.payer_name ?? null, vat: ex.payer_vat ?? null, iban: ex.payer_iban ?? null },
      { name: ex.beneficiary_name ?? null, vat: ex.beneficiary_vat ?? null, iban: ex.beneficiary_iban ?? null },
    ],
  };
  const dirFor = (id: { vat: string | null; name: string | null }) => (isStatement ? "received" : detectDirection(id, ex).direction);
  const issuerIs = (id: import("./recipient-rule.server").EntityIdentity) =>
    (!!sellerVat && !!id.vat && sameVat(sellerVat, id.vat)) || rr.isPsaName(sellerName, id);
  let entityId = channelEntity;
  let entityConflict: string[] | null = null;
  let rcp: import("./recipient-rule.server").RecipientDecision;
  const bankAcct = intake.routeForType(ex.intake_type ?? null, 1) === "bank"
    ? await supabaseAdmin.from("bank_accounts").select("entity_id").eq("id", (await matchBankAccount(ex.iban ?? null, ex.account_number ?? null, null)) ?? "00000000-0000-0000-0000-000000000000").maybeSingle()
    : { data: null };
  if (keepFlag || opts.forcedType || !identities.length) {
    // A person's decision (kept / type confirmed) keeps the item where it is.
    const id = identities.find((i) => i.entityId === entityId) ?? (await rr.loadEntityIdentity(entityId));
    rcp = rr.decideRecipient({ ...routeBase, psa: id, direction: dirFor(id) });
  } else if (bankAcct.data?.entity_id) {
    entityId = bankAcct.data.entity_id;
    rcp = { kind: "psa" };
  } else {
    const route = rr.routeEntity(identities, routeBase, dirFor, issuerIs);
    entityId = route.entityId;
    if (route.kind === "both") { entityConflict = route.entityIds; rcp = { kind: "triage" }; }
    else rcp = route.decision;
  }
  const ident = identities.find((i) => i.entityId === entityId) ?? (await rr.loadEntityIdentity(entityId));

  // Direction step: is this a document we RECEIVED (payable) or one we
  // ISSUED to a client (receivable)? Anchored on the firm's own VAT, its
  // registered name, and the issuer's legal footer block.
  const own = { vat: ident.vat, name: ident.name };
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

  const catalog = isStatement ? [] : await loadClassificationCatalog(entityId);
  const suggested =
    !isStatement && ex.classification_code
      ? catalog.find(
          (c) => c.code.toLowerCase() === ex.classification_code!.trim().toLowerCase(),
        ) ?? null
      : null;

  // The counterparty VAT drives matching: supplier for received, client for issued.
  const counterpartyVat = isStatement ? null : dir.counterparty_vat;
  const counterpartyName = isStatement ? null : dir.counterparty_name;

  let match = isStatement
    ? { status: "no_match" as "matched" | "no_match" | "ambiguous", matched_supplier_id: null as string | null, ambiguous_ids: [] as string[] }
    : await matchSupplierByVat(counterpartyVat);
  // Platform receipts (Uber, Bolt, taxi apps, Amazon) group under the
  // platform supplier; the real issuer stays on the document.
  const platform = isStatement || isIssued ? null : await matchPlatformSupplier(counterpartyName, ex.supplier_name, ex.seller_name, base.original_filename as string | null | undefined);
  if (platform) match = { status: "matched", matched_supplier_id: platform, ambiguous_ids: [] };
  const issuerCols = platform
    ? { issuer_name: counterpartyName ?? null, ...issuerTaxColumns(counterpartyVat, null) }
    : { issuer_name: null, issuer_nif: null, issuer_tax_country: null, issuer_foreign_tax_id: null };
  const recurring = isStatement || isIssued
    ? { is_recurring_candidate: false, reference_id: null, classification_id: null }
    : await detectRecurring(counterpartyVat, ex.total_amount, entityId);
  const groupId = isStatement
    ? null
    : await resolveDocumentGroup(ex.document_number, counterpartyVat, {
        amount: ex.total_amount,
        date: ex.issue_date,
        supplierName: counterpartyName,
        entityId,
      });

  // IRS withheld at source, only when the document actually shows it.
  const rawWithholding = Number(ex.withholding_tax_amount ?? 0);
  const withholdingAmount =
    !isStatement && Number.isFinite(rawWithholding) && rawWithholding > 0
      ? Math.abs(rawWithholding)
      : null;
  // With withholding present, the supplier is owed "Total a pagar", not the
  // VAT-inclusive total — unless the document itself says it is already settled.
  const payableWithWithholding =
    withholdingAmount != null
      ? ex.total_payable ??
        (ex.total_amount != null ? Number(ex.total_amount) - withholdingAmount : null)
      : null;
  const balanceDue = isStatement
    ? null
    : ex.balance_due != null && Number(ex.balance_due) <= 0.005
      ? 0
      : payableWithWithholding ?? ex.balance_due ?? null;


  const payload: Record<string, unknown> = {
    ...base,
    entity_id: entityId,
    entity_conflict_ids: entityConflict,
    raw_extraction: { ...ex, _models: { claude: result.runs.claude.output ?? null, gemini: result.runs.gemini.output ?? null } } as object,
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
    ...issuerCols,
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

    // Fix 1 — was this billed to the firm's own VAT? Informational only:
    // it never changes classification, matching or approval.
    buyer_vat_is_own: isStatement ? false : !!own.vat && sameVat(ex.buyer_vat, own.vat),

    // Fix 2 — payment detail, used later as an extra reconciliation signal.
    // The verbatim payment line is the fallback source for both fields, so a
    // model that skipped the enum/last-4 still yields a usable value.
    extracted_payment_method: isStatement
      ? null
      : (ex.payment_method && ex.payment_method !== "not_stated"
          ? ex.payment_method
          : parsePaymentMethod(ex.payment_method_raw)) ??
        ex.payment_method ??
        null,
    extracted_card_last4: isStatement
      ? null
      : parseCardLast4(ex.card_last4) ??
        parseCardLast4(ex.payment_method_raw, { maskedOnly: true }),


    // IRS withheld at source ("Retenção na fonte IRS"), only when the document
    // actually prints it. Kept strictly apart from VAT.
    extracted_withholding_amount: withholdingAmount,

    // Fix 3 — three-state payment status at ingestion. A missing balance-due
    // field is the safe default (awaiting payment), never "paid".
    // With withholding, the payable is "Total a pagar", not the VAT-inclusive total.
    extracted_balance_due: isStatement ? null : balanceDue,
    payment_status:
      !isStatement && balanceDue != null && Number(balanceDue) <= 0.005
        ? "paid_at_source"
        : "awaiting_payment",


  };

  if (groupId) payload.linked_document_group_id = groupId;

  // ---- Intake type, cross-check and routing (review queue only) ----------
  const checks = result.checks as Record<string, { status: string; reasons: string[] }>;
  const type = ex.intake_type;
  const route = intake.routeForType(type, opts.forcedType ? 1 : ex.intake_type_confidence);
  // Type vs. direction disagreement is surfaced, never silently fixed.
  const typeChecks: Record<string, unknown> = {};
  if ((type === "fatura_emitida" && dir.direction === "received") ||
      ((type === "fatura_compra" || type === "nota_credito") && dir.direction === "issued")) {
    typeChecks.intake_type = { status: "verify", value: type, reasons: ["direction_mismatch"] };
  }
  const isBank = route === "bank";
  const periodSrc = ex.period_end ?? ex.issue_date ?? null;
  Object.assign(payload, {
    intake_type: type,
    intake_type_confidence: opts.forcedType ? 1 : ex.intake_type_confidence ?? null,
    intake_type_source: opts.forcedType ? "manual" : "ai",
    intake_type_reason: ex.intake_type_reason ?? null,
    // "Sempre processar" sender rule: never auto-ignore; a person triages it.
    intake_route: opts.forceProcess && route === "ignored" ? "triage" : route,
    verification: result.verification,
    field_checks: { ...checks, ...typeChecks },
    model_runs: intake.summariseRuns(result.runs),
    retry_after: result.retryLater ? retryAt() : null,
    retry_count: result.retryLater ? retryCount + 1 : 0,
    extracted_base_amount: isStatement && !isBank ? null : ex.amount_ex_vat ?? null,
    extracted_iban: ex.iban ?? null,
    extracted_account_number: ex.account_number ?? null,
    extracted_period_start: ex.period_start ?? null,
    extracted_period_end: ex.period_end ?? null,
    extracted_referenced_document_number: ex.referenced_document_number ?? null,
    // Bank documents keep their movement amount so the Banco list can show it.
    ...(type === "nota_lancamento" ? { extracted_amount: ex.total_amount ?? null } : {}),
    matched_bank_account_id: isBank ? await matchBankAccount(ex.iban, ex.account_number, entityId) : null,
    bank_period: isBank && periodSrc && /^\d{4}-\d{2}/.test(periodSrc) ? periodSrc.slice(0, 7) : null,
    credit_note_original_document_id:
      type === "nota_credito" ? await matchOriginalInvoice(counterpartyVat, ex.referenced_document_number, entityId) : null,
    ...(route === "payments"
      ? await matchPaymentCandidates(ex.seller_vat ?? counterpartyVat, ex.total_amount, entityId)
      : { payment_match_document_id: null, payment_match_candidates: null }),
  });

  payload.applied_learning = applied;

  // Recipient rule (decided above, per entity).
  payload.extracted_recipient_name = rcpName;
  payload.extracted_recipient_vat = rcpVat;
  if (rcp.kind === "triage" && payload.intake_route !== "ignored") payload.intake_route = "triage";
  const removalRule = keepFlag ? null : rr.matchRemovalRule(await rr.loadRemovalRules(entityId), {
    recipientVat: rcpVat, supplierVat: counterpartyVat, sender,
  });

  // A — same document / bank movement / probable duplicate.
  const dupRes = await dups.checkDocumentDuplicates({
    selfId: replaceId,
    createdBefore: selfCreatedAt,
    intakeType: type,
    direction: dir.direction,
    nif: counterpartyVat,
    supplierName: counterpartyName,
    documentNumber: ex.document_number,
    date: ex.issue_date,
    total: ex.total_amount ?? null,
    bankAccountId: (payload.matched_bank_account_id as string | null) ?? null,
    iban: ex.iban ?? null,
    accountNumber: ex.account_number ?? null,
    periodStart: ex.period_start ?? null,
    periodEnd: ex.period_end ?? null,
    entityId,
  });
  Object.assign(payload, dups.duplicateColumns(dupRes));
  // Duplicate logic wins; otherwise apply the recipient rule / deletion rules.
  if (payload.status !== "duplicate") {
    // Auto-removal only when the non-PSA recipient is actually stored on the item.
    const rcpStored = !!(payload.extracted_recipient_name || payload.extracted_recipient_vat);
    if (rcp.kind === "remove" && !rcpStored) { if (payload.intake_route !== "ignored") payload.intake_route = "triage"; }
    else if (rcp.kind === "remove") Object.assign(payload, rr.removeColumns({ reason: rcp.reason, source: "recipient_rule", tag: "not_psa" }));
    else if (removalRule) Object.assign(payload, rr.removeColumns({ reason: removalRule.text, source: `rule:${removalRule.id}`, tag: "rule" }));
  }

  // Incoming / outgoing payments: store payer + beneficiary and the direction.
  const recMod = await import("./recebimentos.server");
  const isProof = (recMod.PAYMENT_PROOF_TYPES as readonly string[]).includes(type ?? "");
  if (isProof) {
    Object.assign(payload, await recMod.partiesColumns({
      payer: { name: ex.payer_name ?? null, vat: ex.payer_vat ?? null, iban: ex.payer_iban ?? null },
      beneficiary: { name: ex.beneficiary_name ?? null, vat: ex.beneficiary_vat ?? null, iban: ex.beneficiary_iban ?? null },
      description: ex.payment_description ?? null,
    }, ident));
  }

  const { data: row, error } = await write(payload);
  if (error || !row) return { ok: false, error: error?.message ?? "write failed" };
  if (isProof && payload.payment_direction === "incoming" && payload.status !== "duplicate" && payload.status !== "removed") {
    try { await recMod.attachProof(row.id); } catch (e) { console.error("[recebimentos] attach failed", e); }
  }
  return {
    ok: true,
    queueItemId: row.id,
    groupId: row.linked_document_group_id,
    duplicate: dupRes.exact ?? undefined,
    possibleDuplicates: dupRes.probable.length ? dupRes.probable : undefined,
  };
}

export type IngestOutcome = {
  ok: boolean;
  queueItemId?: string;
  groupId?: string;
  error?: string;
  duplicate?: import("./intake-duplicates.server").DupMatch;
  possibleDuplicates?: import("./intake-duplicates.server").DupMatch[];
};

/**
 * Re-run extraction + direction detection on an existing PENDING queue row,
 * updating it in place. Approved/rejected rows are never touched — a wrong
 * direction that already produced a live financial record needs manual review.
 */
export async function reprocessQueueItem(
  queueItemId: string,
  opts: { forcedType?: import("./intake-models.server").IntakeType | null } = {},
): Promise<{ ok: boolean; queueItemId?: string; error?: string }> {
  const { data: item, error } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("id, status, source, source_bucket, source_file_url, original_filename, created_by, intake_type, intake_type_source, retry_count, split_of_file_url, split_part, split_page_first, split_page_last, sender_address")
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
    // A person's type choice survives automatic retries and re-runs.
    forcedType:
      opts.forcedType ??
      (item.intake_type_source === "manual"
        ? (item.intake_type as import("./intake-models.server").IntakeType | null)
        : null),
    retryCount: item.retry_count ?? 0,
    senderAddress: (item as { sender_address?: string | null }).sender_address ?? null,
    splitOf: item.split_of_file_url
      ? { fileUrl: item.split_of_file_url, part: item.split_part ?? 0, first: item.split_page_first ?? 1, last: item.split_page_last ?? 1 }
      : null,
  });
}



/**
 * A PDF holding several documents becomes one item per document. Every item
 * keeps the same source file and its own page range, and is read separately
 * (the readers are told to look only at those pages).
 */
async function splitAndIngest(
  opts: Parameters<typeof ingestStoredDocument>[0],
  parts: { first: number; last: number }[],
): Promise<IngestOutcome> {
  let first: IngestOutcome | null = null;
  for (let i = 0; i < parts.length; i++) {
    const r = await ingestStoredDocument({
      ...opts,
      // The first document reuses the original item; the others are new items.
      replaceQueueItemId: i === 0 ? opts.replaceQueueItemId ?? null : null,
      splitOf: { fileUrl: opts.storagePath, part: i + 1, first: parts[i].first, last: parts[i].last },
    });
    if (i === 0) first = r;
  }
  return first!;
}

// ---------------------------------------------------------------------------
// Intake routing helpers (suggestions only — a person confirms each one)
// ---------------------------------------------------------------------------

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const alnum = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Bank account by IBAN, else by account number (digits contained in the IBAN/number). */
export async function matchBankAccount(iban: string | null, accountNumber: string | null, entityId?: string | null): Promise<string | null> {
  let q = supabaseAdmin
    .from("bank_accounts")
    .select("id, iban, account_number")
    .is("archived_at", null);
  // entityId null → search every entity (used to route a bank document by its account).
  if (entityId) q = q.eq("entity_id", entityId);
  const { data } = await q;
  const rows = data ?? [];
  const ib = alnum(iban);
  if (ib.length >= 15) {
    const hit = rows.find((r) => alnum(r.iban) === ib);
    if (hit) return hit.id;
  }
  const acc = digits(accountNumber) || (ib.length >= 15 ? digits(ib.slice(-15)) : "");
  if (acc.length >= 6) {
    const hits = rows.filter(
      (r) => (digits(r.account_number) && digits(r.account_number) === acc) ||
        (digits(r.iban).includes(acc)) || (digits(r.account_number).length >= 6 && acc.includes(digits(r.account_number))),
    );
    if (hits.length === 1) return hits[0].id;
  }
  return null;
}

/** The platform supplier (companies.is_platform) a receipt belongs to, if any. */
export async function matchPlatformSupplier(...texts: Array<string | null | undefined>): Promise<string | null> {
  const key = detectPlatform(...texts);
  if (!key) return null;
  const { data } = await supabaseAdmin.from("companies").select("id, nome").eq("is_platform", true);
  const hits = (data ?? []).filter((c) => platformKeyOfName(c.nome) === key);
  return hits.length === 1 ? hits[0].id : null;
}

async function supplierIdsByVat(vat: string | null): Promise<string[]> {
  const n = normalizeVat(vat)?.replace(/^PT/, "");
  if (!n) return [];
  if (/^\d{9}$/.test(n) && !isValidPortugueseNif(n)) return [];
  const { data } = await supabaseAdmin.from("companies").select("id, nif");
  return (data ?? []).filter((c) => normalizeVat(c.nif)?.replace(/^PT/, "") === n).map((c) => c.id);
}

/** Credit note → the supplier invoice it corrects (same supplier NIF + invoice number). */
export async function matchOriginalInvoice(vat: string | null, refNumber: string | null, entityId: string = PSA_ENTITY_ID): Promise<string | null> {
  if (!refNumber) return null;
  const ids = await supplierIdsByVat(vat);
  if (ids.length === 0) return null;
  const { data } = await supabaseAdmin
    .from("financial_documents")
    .select("id, document_number")
    .eq("entity_id", entityId)
    .in("counterparty_supplier_id", ids)
    .eq("direction", "received");
  const want = alnum(refNumber);
  const hits = (data ?? []).filter((d) => {
    const n = alnum(d.document_number);
    return n && (n === want || n.endsWith(want) || want.endsWith(n));
  });
  return hits.length === 1 ? hits[0].id : null;
}

/** Receipts / payment proofs → open purchases of the same supplier for that amount. */
export async function matchPaymentCandidates(vat: string | null, amount: number | null, entityId: string = PSA_ENTITY_ID) {
  const empty = { payment_match_document_id: null, payment_match_candidates: [] as unknown[] };
  const ids = await supplierIdsByVat(vat);
  if (ids.length === 0) return empty;
  const { data } = await supabaseAdmin
    .from("financial_documents")
    .select("id, document_number, issue_date, due_date, total_inc_vat, outstanding_amount, paid_amount, status, counterparty_name_snapshot")
    .eq("entity_id", entityId)
    .in("counterparty_supplier_id", ids)
    .eq("direction", "received")
    .not("status", "in", "(paid,cancelled)")
    .order("issue_date", { ascending: false })
    .limit(50);
  const rows = (data ?? []).map((d) => {
    const open = Number(d.outstanding_amount ?? Number(d.total_inc_vat) - Number(d.paid_amount ?? 0));
    const exact = amount != null && (Math.abs(open - amount) <= 0.02 || Math.abs(Number(d.total_inc_vat) - amount) <= 0.02);
    return {
      id: d.id,
      document_number: d.document_number,
      issue_date: d.issue_date,
      due_date: d.due_date,
      total: Number(d.total_inc_vat),
      open,
      supplier: d.counterparty_name_snapshot,
      exact_amount: exact,
    };
  });
  rows.sort((a, b) => Number(b.exact_amount) - Number(a.exact_amount));
  const exact = rows.filter((r) => r.exact_amount);
  return {
    payment_match_document_id: exact.length === 1 ? exact[0].id : null,
    payment_match_candidates: rows.slice(0, 10),
  };
}
