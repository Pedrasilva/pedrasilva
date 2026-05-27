/**
 * Purchase invoice OCR — reuses the Lovable AI gateway with the same
 * extraction schema as benefit receipts, but is gated on finance access
 * (admin OR `finance.dashboard` permission) and reads from the
 * `financial-documents` storage bucket (where supplier invoices live).
 *
 * Unlike the benefit flow, this function does NOT insert into
 * `benefit_expense_ocr_extractions`; the financial document itself owns
 * `file_path`, so persistence happens when the editor saves the document.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePortugueseNif, isValidPortugueseNif } from "@/lib/finance/nif";

type ExtractedFields = {
  supplier_name: string | null;
  supplier_nif: string | null;
  document_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  vat_amount: number | null;
  amount_ex_vat: number | null;
  vat_rate: number | null;
  category_guess: string | null;
};

type Confidence = {
  supplier_name: number;
  supplier_nif: number;
  document_number: number;
  issue_date: number;
  total_amount: number;
  vat_amount: number;
};

export type ExtractPurchaseDocResult = {
  ok: boolean;
  status: "succeeded" | "failed";
  extracted?: ExtractedFields;
  confidence?: Confidence;
  matched_supplier_id?: string | null;
  matched_supplier_name?: string | null;
  supplier_is_own_company?: boolean;
  error?: string;
};

const MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const EXTRACTION_JSON_SCHEMA = {
  name: "purchase_document_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      extracted: {
        type: "object",
        additionalProperties: false,
        properties: {
          supplier_name: { type: ["string", "null"] },
          supplier_nif: { type: ["string", "null"] },
          document_number: { type: ["string", "null"] },
          issue_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD" },
          due_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD" },
          total_amount: { type: ["number", "null"] },
          vat_amount: { type: ["number", "null"] },
          amount_ex_vat: { type: ["number", "null"] },
          vat_rate: { type: ["number", "null"] },
          category_guess: { type: ["string", "null"] },
        },
        required: [
          "supplier_name", "supplier_nif", "document_number", "issue_date",
          "due_date", "total_amount", "vat_amount", "amount_ex_vat",
          "vat_rate", "category_guess",
        ],
      },
      confidence: {
        type: "object",
        additionalProperties: false,
        properties: {
          supplier_name: { type: "number" },
          supplier_nif: { type: "number" },
          document_number: { type: "number" },
          issue_date: { type: "number" },
          total_amount: { type: "number" },
          vat_amount: { type: "number" },
        },
        required: [
          "supplier_name", "supplier_nif", "document_number",
          "issue_date", "total_amount", "vat_amount",
        ],
      },
    },
    required: ["extracted", "confidence"],
  },
} as const;

const SYSTEM_PROMPT = `You extract structured data from Portuguese supplier invoices and receipts (faturas, recibos, notas de crédito).
Return strictly the JSON matching the provided schema.
Rules:
- supplier_nif: 9 digits, Portuguese NIF (the SELLER/EMITENTE, never the buyer). Strip "PT" prefix and spaces. Use null if not visible.
- issue_date / due_date: ISO YYYY-MM-DD. Convert DD/MM/YYYY accordingly.
- Amounts: use period as decimal separator, in EUR. Never include currency symbol.
- vat_rate: percentage as a number (e.g. 23, 13, 6). Null if unknown.
- category_guess: short Portuguese category like "serviços", "consumíveis", "equipamento", "alimentação", or null.
- confidence values: 0..1, your honest confidence per field.
- If a field is unreadable or absent, set it to null with low confidence.`;

function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "heic": return "image/heic";
    case "heif": return "image/heif";
    case "jpg":
    case "jpeg":
    default: return "image/jpeg";
  }
}

export const extractPurchaseDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ storagePath: z.string().min(1).max(1024) }).parse(input)
  )
  .handler(async ({ data, context }): Promise<ExtractPurchaseDocResult> => {
    const { supabase, userId } = context;
    const { storagePath } = data;

    // ---- Finance access gate (mirror of UI-side check) -------------------
    const [{ data: isAdmin }, { data: hasFinance }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_permission", {
        _user_id: userId,
        _key: "finance.dashboard",
      }),
    ]);
    if (!isAdmin && !hasFinance) {
      throw new Response("Forbidden: finance access required", { status: 403 });
    }

    const fail = (msg: string): ExtractPurchaseDocResult => ({
      ok: false, status: "failed", error: msg,
    });

    try {
      const { data: file, error: dlErr } = await supabaseAdmin.storage
        .from("financial-documents")
        .download(storagePath);
      if (dlErr || !file) return fail(`download: ${dlErr?.message ?? "no file"}`);

      const buf = Buffer.from(await file.arrayBuffer());
      const mime = file.type || guessMime(storagePath);
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) return fail("LOVABLE_API_KEY missing");

      const aiRes = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract the supplier invoice fields per the schema." },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          response_format: { type: "json_schema", json_schema: EXTRACTION_JSON_SCHEMA },
        }),
      });

      const rawText = await aiRes.text();
      if (!aiRes.ok) return fail(`gateway ${aiRes.status}: ${rawText.slice(0, 300)}`);

      let rawJson: unknown;
      try { rawJson = JSON.parse(rawText); } catch { return fail("invalid JSON from gateway"); }
      const content = (rawJson as { choices?: Array<{ message?: { content?: string } }> })
        ?.choices?.[0]?.message?.content;
      if (!content) return fail("empty model content");

      let parsed: { extracted: ExtractedFields; confidence: Confidence };
      try { parsed = JSON.parse(content); } catch { return fail("model output not JSON"); }

      const extracted = parsed.extracted;
      const confidence = { ...parsed.confidence };

      // Normalize NIF
      if (extracted.supplier_nif) {
        extracted.supplier_nif = normalizePortugueseNif(extracted.supplier_nif);
      }

      // Own-company check
      let ownCompanyNif: string | null = null;
      {
        const { data: settings } = await supabaseAdmin
          .from("pm_invoice_settings")
          .select("company_nif")
          .order("singleton", { ascending: false })
          .limit(1)
          .maybeSingle();
        ownCompanyNif = normalizePortugueseNif(settings?.company_nif ?? null);
      }
      const supplierIsOwnCompany =
        !!ownCompanyNif &&
        !!extracted.supplier_nif &&
        normalizePortugueseNif(extracted.supplier_nif) === ownCompanyNif;

      // Match supplier by NIF (only if not own company)
      let matchedSupplierId: string | null = null;
      let matchedSupplierName: string | null = null;
      if (
        !supplierIsOwnCompany &&
        extracted.supplier_nif &&
        isValidPortugueseNif(extracted.supplier_nif)
      ) {
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("id, nome, is_supplier")
          .eq("nif", extracted.supplier_nif)
          .maybeSingle();
        if (company) {
          matchedSupplierId = company.id;
          matchedSupplierName = company.nome;
        }
      }

      return {
        ok: true,
        status: "succeeded",
        extracted,
        confidence,
        matched_supplier_id: matchedSupplierId,
        matched_supplier_name: matchedSupplierName,
        supplier_is_own_company: supplierIsOwnCompany,
      };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });
