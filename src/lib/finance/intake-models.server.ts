/**
 * Dual-model finance intake: Claude Sonnet + Gemini Flash read the same
 * document with the same instructions and the same field list, each in its
 * provider's own request format. Claude decides the document type and the
 * accounting classification; both extract the key fields, which are then
 * cross-checked (agreement + deterministic checks). Nothing here writes to
 * the database — callers persist the result to the review queue only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isValidPortugueseNif, normalizePortugueseNif } from "@/lib/finance/nif";
import {
  JSON_SCHEMA,
  buildExtractionSystemPrompt,
  getOwnCompanyVat,
  loadClassificationCatalog,
  normalizeVat,
  type IntakeDocType,
  type IntakeExtraction,
} from "@/lib/finance/doc-intake.server";

export const CLAUDE_MODEL = "anthropic/claude-sonnet-5";
export const GEMINI_MODEL = "google/gemini-3.6-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export const INTAKE_TYPES = [
  "fatura_compra",
  "nota_credito",
  "recibo",
  "comprovativo_pagamento",
  "extrato_bancario",
  "nota_lancamento",
  "fatura_emitida",
  "documento_fiscal",
  "contrato_outro",
  "nao_financeiro",
  "desconhecido",
  "outra_entidade",
] as const;
export type IntakeType = (typeof INTAKE_TYPES)[number];

export type IntakeRoute =
  | "triage" | "purchases" | "payments" | "bank" | "issued" | "other" | "ignored" | "retry" | "other_entity";

export const TYPE_CONFIDENCE_MIN = 0.7;

export function routeForType(type: IntakeType | null, confidence: number | null): IntakeRoute {
  if (!type || type === "desconhecido") return "triage";
  if (confidence != null && confidence < TYPE_CONFIDENCE_MIN) return "triage";
  switch (type) {
    case "fatura_compra":
    case "nota_credito":
      return "purchases";
    case "recibo":
    case "comprovativo_pagamento":
      return "payments";
    case "extrato_bancario":
    case "nota_lancamento":
      return "bank";
    case "fatura_emitida":
      return "issued";
    case "documento_fiscal":
    case "contrato_outro":
      return "other";
    case "nao_financeiro":
      return "ignored";
    case "outra_entidade":
      return "other_entity";
  }
}

/** Legacy doc_type column, kept so the existing review/approval flow keeps working. */
export function legacyDocType(type: IntakeType | null): IntakeDocType {
  switch (type) {
    case "fatura_compra":
    case "nota_credito":
    case "fatura_emitida":
      return "invoice";
    case "recibo":
      return "receipt";
    case "comprovativo_pagamento":
      return "proof_of_payment";
    case "extrato_bancario":
    case "nota_lancamento":
      return "bank_statement";
    default:
      return "unknown";
  }
}

export type DualExtraction = IntakeExtraction & {
  intake_type: IntakeType;
  intake_type_confidence: number;
  intake_type_reason: string | null;
  iban: string | null;
  account_number: string | null;
  period_start: string | null;
  period_end: string | null;
  referenced_document_number: string | null;
  recipient_name: string | null;
  recipient_vat: string | null;
};

/** Shared field list: the existing schema plus the intake-routing fields. */
const SHARED_SCHEMA = (() => {
  const base = JSON_SCHEMA.schema as unknown as {
    properties: Record<string, unknown>;
    required: string[];
  };
  const extra = {
    intake_type: { type: "string", enum: [...INTAKE_TYPES] },
    intake_type_confidence: { type: "number" },
    intake_type_reason: { type: ["string", "null"] },
    iban: { type: ["string", "null"] },
    account_number: { type: ["string", "null"] },
    period_start: { type: ["string", "null"] },
    period_end: { type: ["string", "null"] },
    referenced_document_number: { type: ["string", "null"] },
    recipient_name: { type: ["string", "null"] },
    recipient_vat: { type: ["string", "null"] },
  };
  return {
    ...base,
    properties: { ...base.properties, ...extra },
    required: [...base.required, ...Object.keys(extra)],
  };
})();

const INTAKE_RULES = `
SEVERAL DOCUMENTS IN ONE FILE: if the file holds several separate documents (for example several bank notices), call the tool once per document, in page order, and set page_first / page_last on each call.

INTAKE TYPE (field intake_type) — pick exactly one:
- "fatura_compra": an invoice / fatura / fatura-recibo / fatura simplificada ISSUED BY A SUPPLIER TO THE FIRM (the firm is the buyer).
- "nota_credito": a credit note ("nota de crédito", "credit note") from a supplier. Put the invoice it corrects in referenced_document_number when printed.
- "recibo": a receipt confirming that an invoice was paid (no new amount owed).
- "comprovativo_pagamento": a single payment proof — bank transfer confirmation, MB/Multibanco payment slip, card payment confirmation.
- "extrato_bancario": a bank or credit-card account statement listing many movements over a period ("extrato", "extrato combinado").
- "nota_lancamento": a bank debit/credit advice for ONE bank movement ("nota de lançamento", "aviso de débito", "aviso de crédito", bank fee/interest/charge notices).
- "fatura_emitida": an invoice ISSUED BY THE FIRM to a client (the firm is the seller).
- "documento_fiscal": official notices from Autoridade Tributária / Finanças, Segurança Social, courts or other public bodies (notifications, guides, payment notes "DUC", certificates).
- "contrato_outro": contracts, proposals, quotes, orders, agreements and other business documents that are not one of the above.
- "nao_financeiro": not a financial or business document at all (newsletters, marketing, drawings, photos, signatures, terms and conditions, empty pages).
- "outra_entidade": the document is addressed to a company or person OTHER than the firm (its customer / account holder / addressee NIF is not the firm's) and was not issued by the firm.
- "desconhecido": you genuinely cannot tell.
RECIPIENT (every document type, including bank statements and bank notices): recipient_name / recipient_vat = the party the document is ADDRESSED TO — the customer, bill-to, account holder ("Titular", "Cliente", "Exmo(s). Sr(s).", "Adquirente"), exactly as printed. For an invoice issued by the firm this is the client. null when not printed.
intake_type_confidence 0..1, honest. intake_type_reason: one short sentence saying why (no amounts, no personal data).
Keep doc_type consistent with intake_type (fatura_compra/nota_credito/fatura_emitida → "invoice", recibo → "receipt", comprovativo_pagamento → "proof_of_payment", extrato_bancario/nota_lancamento → "bank_statement", others → "unknown").
BANK FIELDS (bank documents only, null otherwise): iban exactly as printed (no spaces needed); account_number = the bank account number ("N.º conta", "Conta") as printed; period_start / period_end ISO dates of the statement period (for a nota de lançamento use the movement date for both). For a nota de lançamento also fill total_amount with the movement amount.
For every type, amount_ex_vat is the base amount before VAT (null if not printed).`;

/** Types that get a second reading (Gemini) for the cross-check. */
export const SECOND_READER_TYPES: IntakeType[] = [
  "fatura_compra", "nota_credito", "recibo", "comprovativo_pagamento",
  "extrato_bancario", "nota_lancamento", "fatura_emitida",
];

export type ModelRun = {
  model: string;
  ok: boolean;
  error?: string;
  /** Gateway refused for credits / rate limits — retry later. */
  limit?: boolean;
  ms: number;
  input_tokens?: number;
  output_tokens?: number;
  /** Additional documents Claude found in the same file. */
  extra_documents?: number;
  /** Page ranges Claude gave for each document in the file (in order). */
  parts?: { first: number; last: number }[];
  /** True when this reader was not needed for the type (cost rule). */
  skipped?: boolean;
  output?: DualExtraction;
};

function isLimit(status: number, body: string) {
  return status === 429 || status === 402 || (status === 403 && /credit_limit|limit/i.test(body));
}

export async function loadFile(bucket: string, path: string) {
  const { data: file, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !file) throw new Error(`download: ${error?.message ?? "no file"}`);
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.split(".").pop()?.toLowerCase();
  const mime =
    file.type && file.type !== "application/octet-stream"
      ? file.type
      : ext === "pdf" ? "application/pdf"
      : ext === "png" ? "image/png"
      : ext === "webp" ? "image/webp"
      : "image/jpeg";
  return { b64: buf.toString("base64"), mime, bytes: new Uint8Array(buf) };
}

async function runGemini(system: string, userText: string, b64: string, mime: string, key: string): Promise<ModelRun> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "financial_document_intake", strict: true, schema: SHARED_SCHEMA },
        },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { model: GEMINI_MODEL, ok: false, ms: Date.now() - t0, limit: isLimit(res.status, text), error: `gateway ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { model: GEMINI_MODEL, ok: false, ms: Date.now() - t0, error: "empty model content" };
    return {
      model: GEMINI_MODEL,
      ok: true,
      ms: Date.now() - t0,
      input_tokens: json.usage?.prompt_tokens,
      output_tokens: json.usage?.completion_tokens,
      output: JSON.parse(content) as DualExtraction,
    };
  } catch (e) {
    return { model: GEMINI_MODEL, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Tool JSON can carry raw control characters copied from the PDF text. */
function parseLenient(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e) {
    // eslint-disable-next-line no-control-regex
    return JSON.parse(s.replace(/[\u0000-\u001f]/g, (c) => (c === "\n" || c === "\t" || c === "\r" ? " " : "")));
  }
}

/** Claude: native Messages API, PDF as a `document` block, schema as a forced tool, streamed. */
async function runClaude(system: string, userText: string, b64: string, mime: string, key: string): Promise<ModelRun> {
  const t0 = Date.now();
  try {
    const block =
      mime === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: mime, data: b64 } }
        : { type: "image", source: { type: "base64", media_type: mime, data: b64 } };
    const res = await fetch(`${GATEWAY}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        stream: true,
        system,
        tools: [
          {
            name: "financial_document_intake",
            description: "Return the extracted document fields.",
            input_schema: {
              ...SHARED_SCHEMA,
              properties: {
                ...(SHARED_SCHEMA as { properties: Record<string, unknown> }).properties,
                page_first: { type: "integer", description: "First page (1-based) of this document in the file." },
                page_last: { type: "integer", description: "Last page (1-based) of this document in the file." },
              },
            },
          },
        ],
        tool_choice: { type: "tool", name: "financial_document_intake" },
        messages: [{ role: "user", content: [block, { type: "text", text: userText }] }],
      }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      return { model: CLAUDE_MODEL, ok: false, ms: Date.now() - t0, limit: isLimit(res.status, text), error: `gateway ${res.status}: ${text.slice(0, 200)}` };
    }
    let json = "";
    let inT = 0;
    let outT = 0;
    let stop = "";
    let streamError: string | null = null;
    let startInput: unknown = null;
    let firstIndex: number | null = null;
    const extraIdx = new Set<number>();
    const blocks = new Map<number, string>();
    let buf = "";
    const dec = new TextDecoder();
    const reader = res.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let ev: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        try { ev = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev.type === "message_start") {
          const u = ev.message?.usage ?? {};
          inT = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        } else if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
          startInput = ev.content_block.input ?? null;
        } else if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") {
          // Claude may answer with several tool calls (e.g. a PDF holding several
          // bank notices). Keep only the first one; the count is reported.
          if (firstIndex == null) firstIndex = ev.index;
          if (ev.index === firstIndex) json += ev.delta.partial_json;
          else extraIdx.add(ev.index);
          blocks.set(ev.index, (blocks.get(ev.index) ?? "") + ev.delta.partial_json);
        } else if (ev.type === "message_delta") {
          outT = ev.usage?.output_tokens ?? outT;
          stop = ev.delta?.stop_reason ?? stop;
        } else if (ev.type === "error") {
          streamError = ev.error?.message ?? "stream error";
        }
      }
    }
    const ms = Date.now() - t0;
    if (streamError) return { model: CLAUDE_MODEL, ok: false, ms, error: streamError, limit: /limit|overloaded/i.test(streamError) };
    if (stop === "refusal") return { model: CLAUDE_MODEL, ok: false, ms, error: "model refused" };
    try {
      const parsed = json.trim()
        ? parseLenient(json)
        : startInput && Object.keys(startInput as object).length > 0 ? startInput : null;
      if (!parsed) throw new Error("empty");
      // Page ranges of every document Claude found (used to split multi-notice PDFs).
      const parts: { first: number; last: number }[] = [];
      for (const k of [...blocks.keys()].sort((a, b) => a - b)) {
        try {
          const o = parseLenient(blocks.get(k)!) as { page_first?: number; page_last?: number };
          const f = Number(o.page_first), l = Number(o.page_last ?? o.page_first);
          if (Number.isInteger(f) && Number.isInteger(l) && f >= 1 && l >= f) parts.push({ first: f, last: l });
        } catch { /* ignore an unreadable extra block */ }
      }
      return {
        model: CLAUDE_MODEL, ok: true, ms, input_tokens: inT, output_tokens: outT,
        extra_documents: extraIdx.size,
        parts: parts.length === blocks.size ? parts : undefined,
        output: parsed as DualExtraction,
      };
    } catch {
      return { model: CLAUDE_MODEL, ok: false, ms, error: `no structured output (stop: ${stop || "?"}, ${json.length} chars: ${json.slice(0, 60)}…${json.slice(-60)})` };
    }
  } catch (e) {
    return { model: CLAUDE_MODEL, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Cross-check
// ---------------------------------------------------------------------------

export const CHECKED_FIELDS = [
  "supplier_vat",
  "document_number",
  "issue_date",
  "amount_ex_vat",
  "vat_amount",
  "total_amount",
  "iban",
  "account_number",
  "recipient_vat",
] as const;
export type CheckedField = (typeof CHECKED_FIELDS)[number];

export type FieldCheck = {
  status: "ok" | "verify";
  /** Value pre-filled (Claude's when both ran). */
  value: string | number | null;
  claude?: string | number | null;
  gemini?: string | number | null;
  reasons: Array<"models_differ" | "nif_check" | "sum_check" | "single_model">;
};

function pick(o: DualExtraction | undefined, f: CheckedField): string | number | null {
  if (!o) return null;
  if (f === "supplier_vat") return o.seller_vat ?? o.supplier_vat ?? null;
  if (f === "recipient_vat") return o.recipient_vat ?? o.buyer_vat ?? null;
  const v = (o as Record<string, unknown>)[f];
  return v == null || v === "" ? null : (v as string | number);
}

function norm(f: CheckedField, v: string | number | null): string {
  if (v == null) return "";
  if (["amount_ex_vat", "vat_amount", "total_amount"].includes(f)) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : String(v);
  }
  if (f === "supplier_vat" || f === "recipient_vat") return normalizeVat(String(v))?.replace(/^PT/, "") ?? "";
  return String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Portuguese NIF check digit; foreign VAT ids are not checked. */
export function nifCheckFails(v: string | number | null): boolean {
  if (v == null) return false;
  const s = String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ptLike = /^PT\d+$/.test(s) || /^\d{9}$/.test(s);
  if (!ptLike) return false;
  return !normalizePortugueseNif(s) || !isValidPortugueseNif(s);
}

export function crossCheck(
  claude?: DualExtraction,
  gemini?: DualExtraction,
  bankDoc = false,
): Record<CheckedField, FieldCheck> {
  const both = !!claude && !!gemini;
  const out = {} as Record<CheckedField, FieldCheck>;
  for (const f of CHECKED_FIELDS) {
    // IBAN / account number only matter for bank documents.
    if (!bankDoc && (f === "iban" || f === "account_number")) {
      out[f] = { status: "ok", value: null, reasons: [] };
      continue;
    }
    const c = pick(claude, f);
    const g = pick(gemini, f);
    const value = claude ? c : g;
    const reasons: FieldCheck["reasons"] = [];
    if (both && norm(f, c) !== norm(f, g)) reasons.push("models_differ");
    if (!both && value != null) reasons.push("single_model");
    out[f] = {
      status: reasons.includes("models_differ") ? "verify" : "ok",
      value,
      ...(claude ? { claude: c } : {}),
      ...(gemini ? { gemini: g } : {}),
      reasons,
    };
  }
  if (nifCheckFails(out.supplier_vat.value)) {
    out.supplier_vat.status = "verify";
    out.supplier_vat.reasons.push("nif_check");
  }
  const b = out.amount_ex_vat.value;
  const v = out.vat_amount.value;
  const t = out.total_amount.value;
  if (b != null && v != null && t != null && Math.abs(Number(b) + Number(v) - Number(t)) > 0.02) {
    for (const f of ["amount_ex_vat", "vat_amount", "total_amount"] as const) {
      out[f].status = "verify";
      out[f].reasons.push("sum_check");
    }
  }
  return out;
}

export type DualResult =
  | {
      ok: true;
      extraction: DualExtraction;
      checks: Record<CheckedField, FieldCheck>;
      verification: "full" | "partial" | "single";
      /** Page ranges when the PDF holds several documents (split into one item each). */
      parts?: { first: number; last: number }[];
      retryLater: boolean;
      runs: { claude: ModelRun; gemini: ModelRun };
    }
  | { ok: false; error: string; retryLater: boolean; runs?: { claude: ModelRun; gemini: ModelRun } };

/**
 * Run both models on a stored file. `forcedType` is a type a person chose
 * ("Reclassificar"); the models then extract for that type.
 */
export async function runDualExtraction(
  bucket: string,
  path: string,
  forcedType?: IntakeType | null,
  /** Read only these pages (one document cut out of a multi-document PDF). */
  pages?: { first: number; last: number } | null,
  extra?: {
    /** File already downloaded by the caller (hash check). */
    preloaded?: { b64: string; mime: string } | null;
    /** "Regras do estúdio", supplier pattern and examples for Claude. */
    claudeContext?: string;
    /** Same, for the second reader, once Claude's supplier NIF is known. */
    geminiContext?: (claudeNif: string | null) => Promise<string>;
  },
): Promise<DualResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, error: "LOVABLE_API_KEY missing", retryLater: false };

  let file: { b64: string; mime: string };
  try {
    file = extra?.preloaded ?? (await loadFile(bucket, path));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), retryLater: false };
  }

  const [catalog, own] = await Promise.all([loadClassificationCatalog(), getOwnCompanyVat()]);
  const catalogText = catalog.map((c) => `${c.code} — ${c.name_en}`).join("\n");
  const system = buildExtractionSystemPrompt(own, catalogText) + "\n" + INTAKE_RULES;
  const userText = forcedType
    ? `A person has confirmed this document is of type "${forcedType}". Set intake_type to "${forcedType}" with confidence 1 and extract the fields for that type.`
    : "Extract the document fields per the schema.";
  const pageText = pages
    ? `\nThis file holds several documents. Read ONLY page${pages.first === pages.last ? ` ${pages.first}` : `s ${pages.first}–${pages.last}`} and ignore all other pages. Return exactly one result.`
    : "";

  // Claude reads the type first; Gemini is a second reader only for the
  // money-bearing types (or as a fallback when Claude fails).
  const claude = await runClaude(system + (extra?.claudeContext ?? ""), userText + pageText, file.b64, file.mime, key);
  const claudeType = forcedType ?? (claude.ok ? claude.output?.intake_type : null);
  const needSecond = !claude.ok || (!!claudeType && SECOND_READER_TYPES.includes(claudeType as IntakeType));
  const gemini: ModelRun = needSecond
    ? await runGemini(
        system + (extra?.geminiContext ? await extra.geminiContext(claude.ok ? claude.output?.seller_vat ?? claude.output?.supplier_vat ?? null : null) : extra?.claudeContext ?? ""),
        userText + pageText, file.b64, file.mime, key,
      )
    : { model: GEMINI_MODEL, ok: false, ms: 0, skipped: true };
  const runs = { claude, gemini };
  const retryLater = (!claude.ok && !!claude.limit) || (!gemini.ok && !!gemini.limit);

  if (!claude.ok && !gemini.ok) {
    return { ok: false, error: `claude: ${claude.error}; gemini: ${gemini.error}`, retryLater, runs };
  }

  const primary = (claude.ok ? claude.output : gemini.output)!;
  const type: IntakeType = forcedType ?? (INTAKE_TYPES.includes(primary.intake_type) ? primary.intake_type : "desconhecido");
  const checks = crossCheck(claude.ok ? claude.output : undefined, gemini.ok ? gemini.output : undefined, routeForType(type, 1) === "bank");

  const extraction: DualExtraction = {
    ...primary,
    intake_type: type,
    intake_type_confidence: forcedType ? 1 : Number(primary.intake_type_confidence ?? 0),
    doc_type: legacyDocType(type),
    seller_vat: (checks.supplier_vat.value as string | null) ?? null,
    supplier_vat: (checks.supplier_vat.value as string | null) ?? null,
    document_number: (checks.document_number.value as string | null) ?? null,
    issue_date: (checks.issue_date.value as string | null) ?? null,
    amount_ex_vat: checks.amount_ex_vat.value == null ? null : Number(checks.amount_ex_vat.value),
    vat_amount: checks.vat_amount.value == null ? null : Number(checks.vat_amount.value),
    total_amount: checks.total_amount.value == null ? null : Number(checks.total_amount.value),
    iban: (checks.iban.value as string | null) ?? null,
    account_number: (checks.account_number.value as string | null) ?? null,
    recipient_vat: (checks.recipient_vat.value as string | null) ?? primary.recipient_vat ?? null,
    // Type + classification come from Claude (Gemini only as a fallback).
    classification_code: primary.classification_code,
    classification_confidence: primary.classification_confidence,
  };

  return {
    ok: true,
    extraction,
    checks,
    verification: claude.ok && gemini.ok ? "full" : gemini.skipped ? "single" : "partial",
    parts: !pages && file.mime === "application/pdf" && claude.parts && claude.parts.length > 1 ? claude.parts : undefined,
    retryLater,
    runs,
  };
}

/** Compact, content-free summary of each model run for the queue row. */
export function summariseRuns(runs: { claude: ModelRun; gemini: ModelRun }) {
  const s = (r: ModelRun) => ({
    model: r.model,
    ok: r.ok,
    error: r.error ?? null,
    limit: !!r.limit,
    ms: r.ms,
    input_tokens: r.input_tokens ?? null,
    output_tokens: r.output_tokens ?? null,
    extra_documents: r.extra_documents ?? 0,
    parts: r.parts ?? null,
    skipped: !!r.skipped,
    intake_type: r.output?.intake_type ?? null,
    classification_code: r.output?.classification_code ?? null,
  });
  return { claude: s(runs.claude), gemini: s(runs.gemini) };
}
