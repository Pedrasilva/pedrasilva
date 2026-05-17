import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePortugueseNif, isValidPortugueseNif } from "@/lib/finance/nif";

// ---- Types ----------------------------------------------------------------
type ExtractedFields = {
  supplier_name: string | null;
  supplier_nif: string | null;
  document_number: string | null;
  issue_date: string | null;
  total_amount: number | null;
  vat_amount: number | null;
  amount_ex_vat: number | null;
  vat_rate: number | null;
  payment_method: string | null;
  card_last4: string | null;
  payment_account_hint: string | null;
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

export type ExtractBenefitReceiptResult = {
  ok: boolean;
  extraction_id: string;
  status: "succeeded" | "failed";
  extracted?: ExtractedFields;
  confidence?: Confidence;
  matched_company_id?: string | null;
  /** True when extracted supplier NIF matches our own company NIF —
   * receipts where the OCR mistakenly picked up the buyer NIF. */
  supplier_is_own_company?: boolean;
  error?: string;
};

const MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const PROVIDER = `lovable-ai:${MODEL}`;

// JSON Schema for structured output
const EXTRACTION_JSON_SCHEMA = {
  name: "benefit_receipt_extraction",
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
          total_amount: { type: ["number", "null"] },
          vat_amount: { type: ["number", "null"] },
          amount_ex_vat: { type: ["number", "null"] },
          vat_rate: { type: ["number", "null"] },
          payment_method: { type: ["string", "null"], description: "e.g. cash, card, mbway, transfer" },
          card_last4: { type: ["string", "null"] },
          payment_account_hint: { type: ["string", "null"] },
          category_guess: { type: ["string", "null"] },
        },
        required: [
          "supplier_name", "supplier_nif", "document_number", "issue_date",
          "total_amount", "vat_amount", "amount_ex_vat", "vat_rate",
          "payment_method", "card_last4", "payment_account_hint", "category_guess",
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

const SYSTEM_PROMPT = `You extract structured data from Portuguese receipts and invoices (faturas, talões, recibos).
Return strictly the JSON matching the provided schema.
Rules:
- supplier_nif: 9 digits, Portuguese NIF. Strip "PT" prefix and spaces. Use null if not visible.
- issue_date: ISO YYYY-MM-DD. Convert DD/MM/YYYY or DD-MM-YYYY accordingly.
- Amounts: use period as decimal separator, in EUR. Never include currency symbol.
- vat_rate: percentage as a number (e.g. 23, 13, 6). Null if unknown.
- payment_method: one of cash, card, mbway, transfer, multibanco, other, or null.
- card_last4: last 4 digits of card if printed, else null.
- category_guess: short Portuguese category like "alimentação", "saúde", "educação", "transporte", or null.
- confidence values: 0..1, your honest confidence per field.
- If a field is unreadable or absent, set it to null with low confidence.`;

function toIsoDate(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

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

export const extractBenefitReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ storagePath: z.string().min(1).max(1024) }).parse(input)
  )
  .handler(async ({ data, context }): Promise<ExtractBenefitReceiptResult> => {
    const { supabase, userId } = context;
    const { storagePath } = data;

    // ---- Resolve caller's collaborator + role -----------------------------
    const { data: myCollabId } = await supabase.rpc("get_my_collaborator_id");
    const callerCollabId = (myCollabId as string | null) ?? null;

    const [{ data: isAdmin }, { data: canApprove }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("can_approve_benefits", { _user_id: userId }),
    ]);
    const elevated = Boolean(isAdmin) || Boolean(canApprove);

    // ---- Ownership check from path prefix --------------------------------
    // Convention: "<collaborator_id>/<uuid>.<ext>"
    const ownerFromPath = storagePath.split("/")[0] ?? "";
    const isOwner = !!callerCollabId && ownerFromPath === callerCollabId;
    if (!elevated && !isOwner) {
      throw new Response("Forbidden: not receipt owner", { status: 403 });
    }

    // collaborator_id to associate with the extraction row
    const targetCollaboratorId = isOwner ? callerCollabId! : ownerFromPath;
    if (!/^[0-9a-f-]{36}$/i.test(targetCollaboratorId)) {
      throw new Response("Invalid storage path", { status: 400 });
    }

    const insertFailedRow = async (errorMsg: string, raw?: unknown) => {
      const { data: row } = await supabaseAdmin
        .from("benefit_expense_ocr_extractions")
        .insert({
          collaborator_id: targetCollaboratorId,
          storage_path: storagePath,
          status: "failed",
          provider: PROVIDER,
          error: errorMsg.slice(0, 2000),
          raw_response: raw ? (raw as never) : null,
          processed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      return {
        ok: false as const,
        status: "failed" as const,
        extraction_id: row?.id ?? "",
        error: errorMsg,
      };
    };

    try {
      // ---- Download file ------------------------------------------------
      const { data: file, error: dlErr } = await supabaseAdmin.storage
        .from("benefit-receipts")
        .download(storagePath);
      if (dlErr || !file) {
        return await insertFailedRow(`download: ${dlErr?.message ?? "no file"}`);
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const mime = file.type || guessMime(storagePath);
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

      // ---- Call Lovable AI Gateway -------------------------------------
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) return await insertFailedRow("LOVABLE_API_KEY missing");

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
                { type: "text", text: "Extract the receipt fields per the schema." },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          response_format: { type: "json_schema", json_schema: EXTRACTION_JSON_SCHEMA },
        }),
      });

      const rawText = await aiRes.text();
      if (!aiRes.ok) {
        return await insertFailedRow(
          `gateway ${aiRes.status}: ${rawText.slice(0, 500)}`,
          { status: aiRes.status, body: rawText.slice(0, 4000) }
        );
      }

      let rawJson: unknown;
      try { rawJson = JSON.parse(rawText); } catch {
        return await insertFailedRow("invalid JSON from gateway", { body: rawText.slice(0, 4000) });
      }

      const content = (rawJson as { choices?: Array<{ message?: { content?: string } }> })
        ?.choices?.[0]?.message?.content;
      if (!content) return await insertFailedRow("empty model content", rawJson);

      let parsed: { extracted: ExtractedFields; confidence: Confidence };
      try { parsed = JSON.parse(content); } catch {
        return await insertFailedRow("model output not JSON", { content });
      }

      // ---- Post-validation ---------------------------------------------
      const extracted = parsed.extracted;
      const confidence = { ...parsed.confidence };

      // NIF normalization + validation
      const normNif = normalizePortugueseNif(extracted.supplier_nif);
      if (normNif) extracted.supplier_nif = normNif;
      if (!normNif || !isValidPortugueseNif(normNif)) {
        confidence.supplier_nif = Math.min(confidence.supplier_nif ?? 0, 0.2);
      }

      // Date normalization
      extracted.issue_date = toIsoDate(extracted.issue_date);
      if (!extracted.issue_date) {
        confidence.issue_date = Math.min(confidence.issue_date ?? 0, 0.2);
      }

      // VAT consistency check
      const t = extracted.total_amount;
      const v = extracted.vat_amount;
      const x = extracted.amount_ex_vat;
      if (t != null && v != null && x != null) {
        if (Math.abs((x + v) - t) > 0.02) {
          confidence.vat_amount = Math.min(confidence.vat_amount ?? 0, 0.3);
        }
      } else if (v != null || x != null) {
        confidence.vat_amount = Math.min(confidence.vat_amount ?? 0, 0.5);
      }

      // ---- Company matching by NIF -------------------------------------
      let matchedCompanyId: string | null = null;
      if (extracted.supplier_nif && isValidPortugueseNif(extracted.supplier_nif)) {
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("id")
          .eq("nif", extracted.supplier_nif)
          .maybeSingle();
        matchedCompanyId = (company as { id: string } | null)?.id ?? null;
      }

      // ---- Persist (always new row) ------------------------------------
      const { data: row, error: insErr } = await supabaseAdmin
        .from("benefit_expense_ocr_extractions")
        .insert({
          collaborator_id: targetCollaboratorId,
          storage_path: storagePath,
          status: "succeeded",
          provider: PROVIDER,
          raw_response: rawJson as never,
          extracted: extracted as never,
          confidence: confidence as never,
          matched_company_id: matchedCompanyId,
          processed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insErr || !row) {
        return await insertFailedRow(`persist: ${insErr?.message ?? "no row"}`, rawJson);
      }

      return {
        ok: true,
        status: "succeeded",
        extraction_id: row.id,
        extracted,
        confidence,
        matched_company_id: matchedCompanyId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return await insertFailedRow(`unexpected: ${msg}`);
    }
  });
