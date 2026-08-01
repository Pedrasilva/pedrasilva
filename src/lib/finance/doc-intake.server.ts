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

export type IntakeDocType = "invoice" | "receipt" | "proof_of_payment" | "unknown";

export type IntakeExtraction = {
  doc_type: IntakeDocType;
  doc_type_confidence: number;
  supplier_name: string | null;
  supplier_vat: string | null;
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
      doc_type: { type: "string", enum: ["invoice", "receipt", "proof_of_payment", "unknown"] },
      doc_type_confidence: { type: "number" },
      supplier_name: { type: ["string", "null"] },
      supplier_vat: { type: ["string", "null"] },
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

  const system = `You extract structured data from financial documents (invoices, receipts, proofs of payment) issued to an architecture firm in Portugal. Documents may be Portuguese or English.
Rules:
- doc_type: "invoice" (amount owed), "receipt" (payment confirmation / paid receipt), "proof_of_payment" (bank transfer confirmation, payment slip), otherwise "unknown".
- supplier_vat: the SELLER's VAT/NIF exactly as printed, including any country prefix (e.g. IE4276970QH, PT501234567). Never the buyer's. null if absent.
- supplier_name: the seller / issuer legal name.
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
 * Document pairing: an invoice and its receipt / proof of payment that share
 * the same document number (and supplier) are ONE transaction. Reuse the
 * existing group id so the queue shows them as a single reviewable unit.
 */
export async function resolveDocumentGroup(
  documentNumber: string | null,
  vat: string | null,
): Promise<string | null> {
  const num = documentNumber?.trim();
  if (!num) return null;
  const { data } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("id, linked_document_group_id, extracted_document_number, extracted_supplier_vat")
    .eq("extracted_document_number", num)
    .neq("status", "rejected")
    .limit(20);

  const nv = normalizeVat(vat);
  const sibling = ((data ?? []) as Array<{
    linked_document_group_id: string; extracted_supplier_vat: string | null;
  }>).find((r) => !nv || !r.extracted_supplier_vat || normalizeVat(r.extracted_supplier_vat) === nv);

  return sibling?.linked_document_group_id ?? null;
}
