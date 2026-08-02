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
    },
    required: [
      "doc_type", "doc_type_confidence", "supplier_name", "supplier_vat",
      "seller_name", "seller_vat", "buyer_name", "buyer_vat",
      "document_number", "issue_date", "due_date", "currency", "total_amount",
      "vat_amount", "amount_ex_vat", "classification_code",
      "classification_confidence", "summary",
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

  const system = `You classify and extract structured data from financial documents (invoices, receipts, proofs of payment, bank statements) received by an architecture firm in Portugal. Documents may be Portuguese or English.
Rules:
- FIRST decide doc_type: "bank_statement" (a bank/credit-card account statement or combined extract listing many transactions over a period — e.g. "extrato", "extrato combinado", "account statement"; it has NO single seller and NO single invoice total), "invoice" (a single amount owed to one seller), "receipt" (payment confirmation / paid receipt for a single purchase), "proof_of_payment" (bank transfer confirmation or payment slip for a single payment), otherwise "unknown".
- If doc_type is "bank_statement": set supplier_name, supplier_vat and classification_code to null. The bank is NOT a supplier. Statements are handled by the banking import, not by supplier classification.
- ALWAYS extract BOTH parties of an invoice/receipt separately:
  - seller_name / seller_vat: the party ISSUING the document (the one being paid), exactly as printed, including any country prefix (e.g. IE4276970QH, PT501234567).
  - buyer_name / buyer_vat: the party the document is BILLED TO (the one paying). Look for "Cliente", "Bill to", "Adquirente", "Exmos. Srs.", "Contribuinte n.º".
  - Never swap them and never leave a VAT blank when it is printed anywhere on the document.
- supplier_vat / supplier_name: keep these equal to seller_vat / seller_name (legacy fields).
- For bank_statement / proof_of_payment where there is no clear seller/buyer pair, set the party fields to null rather than guessing.
- document_number: the invoice or receipt number as printed.
- issue_date / due_date: ISO YYYY-MM-DD.
- Amounts numeric, decimal point, no currency symbol. currency as ISO code (EUR, USD...).
- classification_code: pick the single best matching code from the taxonomy below. Use the code string EXACTLY. Never invent a code. null if nothing fits.
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
  source: "manual_upload" | "email_ingestion";
  createdBy?: string | null;
}): Promise<{ ok: boolean; queueItemId?: string; groupId?: string; error?: string }> {
  const result = await extractDocument(opts.bucket, opts.storagePath);

  const base = {
    source_file_url: opts.storagePath,
    source_bucket: opts.bucket,
    original_filename: opts.originalFilename ?? null,
    source: opts.source,
    created_by: opts.createdBy ?? null,
  };

  if (!result.ok) {
    const { data: row, error } = await supabaseAdmin
      .from("financial_document_review_queue")
      .insert({ ...base, extraction_error: result.error })
      .select("id, linked_document_group_id")
      .single();
    if (error) return { ok: false, error: error.message };
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

  const catalog = isStatement ? [] : await loadClassificationCatalog();
  const suggested =
    !isStatement && ex.classification_code
      ? catalog.find(
          (c) => c.code.toLowerCase() === ex.classification_code!.trim().toLowerCase(),
        ) ?? null
      : null;

  const match = isStatement
    ? { status: "no_match" as const, matched_supplier_id: null, ambiguous_ids: [] as string[] }
    : await matchSupplierByVat(ex.supplier_vat);
  const recurring = isStatement
    ? { is_recurring_candidate: false, reference_id: null, classification_id: null }
    : await detectRecurring(ex.supplier_vat, ex.total_amount);
  const groupId = isStatement
    ? null
    : await resolveDocumentGroup(ex.document_number, ex.supplier_vat, {
        amount: ex.total_amount,
        date: ex.issue_date,
        supplierName: ex.supplier_name,
      });

  const payload: Record<string, unknown> = {
    ...base,
    raw_extraction: result.raw as object,
    doc_type: ex.doc_type ?? "unknown",
    doc_type_confidence: ex.doc_type_confidence ?? null,
    extracted_amount: isStatement ? null : ex.total_amount,
    extracted_vat_amount: isStatement ? null : ex.vat_amount,
    extracted_date: ex.issue_date,
    extracted_due_date: isStatement ? null : ex.due_date,
    extracted_currency: ex.currency ?? "EUR",
    extracted_document_number: ex.document_number,
    extracted_supplier_name: isStatement ? null : ex.supplier_name,
    extracted_supplier_vat: isStatement ? null : ex.supplier_vat,
    supplier_match_status: match.status,
    matched_supplier_id: match.matched_supplier_id,
    ambiguous_supplier_ids: match.ambiguous_ids,
    suggested_classification_id: recurring.classification_id ?? suggested?.id ?? null,
    suggested_classification_code: suggested?.code ?? (isStatement ? null : ex.classification_code) ?? null,
    classification_confidence: isStatement ? null : ex.classification_confidence ?? null,
    is_recurring_candidate: recurring.is_recurring_candidate,
    recurring_reference_id: recurring.reference_id,
  };

  if (groupId) payload.linked_document_group_id = groupId;

  const { data: row, error } = await supabaseAdmin
    .from("financial_document_review_queue")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(payload as any)
    .select("id, linked_document_group_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, queueItemId: row.id, groupId: row.linked_document_group_id };
}
