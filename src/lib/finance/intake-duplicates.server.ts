/**
 * Finance intake duplicate detection (server-only). Suggestions and flags
 * only: nothing is deleted, and nothing new is created from a duplicate.
 *
 *  a. same file (SHA-256)                    → "duplicate" (no AI read)
 *  b. same supplier NIF + number + year      → "duplicate"
 *  c. same NIF + total ±0.01 + date ±5 days  → "possible duplicate" (a person decides)
 *  d. bank: same account + date + amount + reference, or same statement period → "duplicate"
 *
 * Pair decisions ("Não é duplicado") live in finance_duplicate_decisions and
 * are honoured by every check.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PSA_ENTITY_ID } from "@/lib/finance/entity";
import { normalizeVat } from "@/lib/finance/doc-intake.server";
import { isValidPortugueseNif } from "@/lib/finance/nif";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Document number ignoring spaces, dashes, leading zeros and the series
 * prefix: "FT 2026/0123" → "123", "FR A-00045" → "45". Numbers without
 * digits fall back to their letters.
 */
export function normDocNumber(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).toUpperCase();
  const runs = s.match(/\d+/g);
  if (runs && runs.length) {
    const last = runs[runs.length - 1]!.replace(/^0+/, "");
    return last || "0";
  }
  const a = s.replace(/[^A-Z]/g, "");
  return a || null;
}

const nifKey = (v: string | null | undefined) => {
  const k = normalizeVat(v)?.replace(/^PT/, "") ?? null;
  // An invalid Portuguese NIF or a placeholder never identifies anyone.
  return k && /^\d{9}$/.test(k) && !isValidPortugueseNif(k) ? null : k;
};

export type DupMatch = {
  kind: "file" | "document" | "bank" | "probable";
  reason: string;
  queueItemId?: string;
  documentId?: string;
  label: string;
  /** When the original was registered. */
  registeredAt: string | null;
};

type Pair = { a: string; b: string };
const pairOf = (x: string, y: string): Pair => (x < y ? { a: x, b: y } : { a: y, b: x });

async function notDuplicatePairs(selfId: string | null): Promise<Set<string>> {
  if (!selfId) return new Set();
  const { data } = await supabaseAdmin
    .from("finance_duplicate_decisions")
    .select("item_a, item_b, decision")
    .or(`item_a.eq.${selfId},item_b.eq.${selfId}`);
  const s = new Set<string>();
  for (const r of data ?? []) if (r.decision === "not_duplicate") s.add(r.item_a === selfId ? r.item_b : r.item_a);
  return s;
}

/** a — same file. The oldest copy is the original. */
export async function findFileDuplicate(opts: {
  hash: string;
  selfId: string | null;
  storagePath: string;
  createdBefore?: string | null;
}): Promise<DupMatch | null> {
  let q = supabaseAdmin
    .from("financial_document_review_queue")
    .select("id, created_at, original_filename, status, source_file_url, split_of_file_url, split_part")
    .eq("file_sha256", opts.hash)
    .neq("status", "rejected")
    .neq("status", "duplicate")
    .order("created_at", { ascending: true })
    .limit(20);
  if (opts.createdBefore) q = q.lt("created_at", opts.createdBefore);
  const { data } = await q;
  const skip = await notDuplicatePairs(opts.selfId);
  const hit = (data ?? []).find(
    (r) =>
      r.id !== opts.selfId &&
      !skip.has(r.id) &&
      // Items cut out of the same PDF share the file on purpose.
      r.source_file_url !== opts.storagePath &&
      r.split_of_file_url !== opts.storagePath,
  );
  if (!hit) return null;
  return {
    kind: "file",
    reason: "same_file",
    queueItemId: hit.id,
    label: hit.original_filename ?? hit.id.slice(0, 8),
    registeredAt: hit.created_at,
  };
}

export type DupInput = {
  selfId: string | null;
  createdBefore?: string | null;
  intakeType: string | null;
  direction: "received" | "issued" | "unclear" | null;
  nif: string | null;
  supplierName: string | null;
  documentNumber: string | null;
  date: string | null;
  total: number | null;
  bankAccountId: string | null;
  iban: string | null;
  accountNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** Only this entity's items and records are compared (default PSA). */
  entityId?: string;
};

type QRow = {
  id: string;
  created_at: string;
  intake_type: string | null;
  direction: string | null;
  extracted_supplier_vat: string | null;
  extracted_seller_vat: string | null;
  extracted_buyer_vat: string | null;
  extracted_supplier_name: string | null;
  extracted_seller_name: string | null;
  extracted_document_number: string | null;
  extracted_date: string | null;
  extracted_amount: number | null;
  matched_bank_account_id: string | null;
  extracted_iban: string | null;
  extracted_account_number: string | null;
  extracted_period_start: string | null;
  extracted_period_end: string | null;
};

const Q_COLS =
  "id, created_at, intake_type, direction, extracted_supplier_vat, extracted_seller_vat, extracted_buyer_vat, extracted_supplier_name, extracted_seller_name, extracted_document_number, extracted_date, extracted_amount, matched_bank_account_id, extracted_iban, extracted_account_number, extracted_period_start, extracted_period_end";

function rowNif(r: QRow) {
  return nifKey(r.direction === "issued" ? r.extracted_buyer_vat : r.extracted_supplier_vat ?? r.extracted_seller_vat);
}
const alnum = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const days = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

const BANK_TYPES = ["extrato_bancario", "nota_lancamento"];
const DOC_TYPES = ["fatura_compra", "nota_credito", "fatura_emitida", "recibo", "comprovativo_pagamento", "documento_fiscal"];

/** b, c, d — compared against queue items (not rejected) and live records. */
export async function checkDocumentDuplicates(input: DupInput): Promise<{ exact: DupMatch | null; probable: DupMatch[] }> {
  const empty = { exact: null, probable: [] as DupMatch[] };
  const type = input.intakeType;
  if (!type) return empty;
  const skip = await notDuplicatePairs(input.selfId);

  let q = supabaseAdmin
    .from("financial_document_review_queue")
    .select(Q_COLS)
    .eq("entity_id", input.entityId ?? PSA_ENTITY_ID)
    .eq("intake_type", type)
    .neq("status", "rejected")
    .neq("status", "duplicate")
    .order("created_at", { ascending: true })
    .limit(2000);
  if (input.createdBefore) q = q.lt("created_at", input.createdBefore);
  const { data } = await q;
  const rows = ((data ?? []) as QRow[]).filter((r) => r.id !== input.selfId && !skip.has(r.id));
  const label = (r: QRow) =>
    [r.extracted_document_number, r.extracted_supplier_name ?? r.extracted_seller_name].filter(Boolean).join(" · ") || r.id.slice(0, 8);

  // d — bank documents.
  if (BANK_TYPES.includes(type)) {
    const sameAccount = (r: QRow) =>
      (!!input.bankAccountId && r.matched_bank_account_id === input.bankAccountId) ||
      (!!alnum(input.iban) && alnum(r.extracted_iban) === alnum(input.iban)) ||
      (!!alnum(input.accountNumber) && alnum(r.extracted_account_number) === alnum(input.accountNumber));
    if (type === "extrato_bancario") {
      if (!input.periodStart || !input.periodEnd) return empty;
      const hit = rows.find(
        (r) => sameAccount(r) && r.extracted_period_start === input.periodStart && r.extracted_period_end === input.periodEnd,
      );
      return hit
        ? { exact: { kind: "bank", reason: "same_statement_period", queueItemId: hit.id, label: `${hit.extracted_period_start} → ${hit.extracted_period_end}`, registeredAt: hit.created_at }, probable: [] }
        : empty;
    }
    if (!input.date || input.total == null) return empty;
    const ref = normDocNumber(input.documentNumber);
    const same = rows.filter(
      (r) => sameAccount(r) && r.extracted_date === input.date && r.extracted_amount != null && Math.abs(Number(r.extracted_amount) - input.total!) <= 0.01,
    );
    const exact = same.find((r) => ref && normDocNumber(r.extracted_document_number) === ref);
    if (exact) {
      return { exact: { kind: "bank", reason: "same_bank_movement", queueItemId: exact.id, label: label(exact), registeredAt: exact.created_at }, probable: [] };
    }
    // Same account/date/amount but no shared reference: a person decides.
    return {
      exact: null,
      probable: same
        .filter((r) => !ref || !r.extracted_document_number)
        .slice(0, 5)
        .map((r) => ({ kind: "probable" as const, reason: "same_account_date_amount", queueItemId: r.id, label: label(r), registeredAt: r.created_at })),
    };
  }

  if (!DOC_TYPES.includes(type)) return empty;
  const nif = nifKey(input.nif);
  if (!nif) return empty;
  const num = normDocNumber(input.documentNumber);
  const year = input.date?.slice(0, 4) ?? null;
  const sameNif = rows.filter((r) => rowNif(r) === nif);

  // b — same document in the queue.
  if (num && year) {
    const hit = sameNif.find((r) => normDocNumber(r.extracted_document_number) === num && r.extracted_date?.slice(0, 4) === year);
    if (hit) return { exact: { kind: "document", reason: "same_nif_number_year", queueItemId: hit.id, label: label(hit), registeredAt: hit.created_at }, probable: [] };
  }

  // Live records: purchases / issued invoices (financial_documents).
  const live: Array<{ id: string; document_number: string | null; issue_date: string | null; total_inc_vat: number | null; counterparty_name_snapshot: string | null; created_at: string }> = [];
  if (["fatura_compra", "nota_credito", "fatura_emitida"].includes(type)) {
    const issued = type === "fatura_emitida";
    const { data: cos } = await supabaseAdmin.from("companies").select("id, nif").not("nif", "is", null);
    const ids = (cos ?? []).filter((c) => nifKey(c.nif) === nif).map((c) => c.id);
    if (ids.length) {
      const { data: docs } = await supabaseAdmin
        .from("financial_documents")
        .select("id, document_number, issue_date, total_inc_vat, counterparty_name_snapshot, created_at, status")
        .eq("entity_id", input.entityId ?? PSA_ENTITY_ID)
        .in(issued ? "counterparty_client_id" : "counterparty_supplier_id", ids)
        .eq("direction", issued ? "issued" : "received")
        .neq("status", "cancelled");
      live.push(...((docs ?? []) as typeof live));
    }
    // Platform receipts carry the real issuer's tax number on the document.
    const { data: byIssuer } = await supabaseAdmin
      .from("financial_documents")
      .select("id, document_number, issue_date, total_inc_vat, counterparty_name_snapshot, created_at, status, issuer_nif, issuer_foreign_tax_id")
      .eq("entity_id", input.entityId ?? PSA_ENTITY_ID)
      .eq("direction", issued ? "issued" : "received")
      .neq("status", "cancelled")
      .or(`issuer_nif.eq.${nif},issuer_foreign_tax_id.ilike.%${nif}`);
    const seen = new Set(live.map((d) => d.id));
    for (const d of byIssuer ?? []) if (!seen.has(d.id)) live.push(d as (typeof live)[number]);
  }
  // Live payments: a proof of payment already recorded on a purchase of this supplier.
  const livePayments: Array<{ id: string; amount: number; payment_date: string; created_at: string; label: string }> = [];
  if (type === "comprovativo_pagamento") {
    const { data: cos } = await supabaseAdmin.from("companies").select("id, nif").not("nif", "is", null);
    const ids = (cos ?? []).filter((c) => nifKey(c.nif) === nif).map((c) => c.id);
    if (ids.length) {
      const { data: docs } = await supabaseAdmin
        .from("financial_documents").select("id, document_number, counterparty_name_snapshot").eq("entity_id", input.entityId ?? PSA_ENTITY_ID).in("counterparty_supplier_id", ids);
      const byId = new Map((docs ?? []).map((d) => [d.id, d]));
      if (byId.size) {
        const { data: pays } = await supabaseAdmin
          .from("financial_document_payments").select("id, document_id, amount, payment_date, created_at").in("document_id", [...byId.keys()]);
        for (const p of pays ?? []) {
          const d = byId.get(p.document_id);
          livePayments.push({ id: p.document_id, amount: Number(p.amount), payment_date: p.payment_date, created_at: p.created_at,
            label: [d?.document_number, d?.counterparty_name_snapshot].filter(Boolean).join(" · ") });
        }
      }
    }
  }
  const liveLabel = (d: (typeof live)[number]) => [d.document_number, d.counterparty_name_snapshot].filter(Boolean).join(" · ");
  if (num && year) {
    const hit = live.find((d) => normDocNumber(d.document_number) === num && d.issue_date?.slice(0, 4) === year && !skip.has(d.id));
    if (hit) return { exact: { kind: "document", reason: "same_nif_number_year_live", documentId: hit.id, label: liveLabel(hit), registeredAt: hit.created_at }, probable: [] };
  }

  // c — probable: same NIF + total ±0.01 + date ±5 days, number not matching.
  if (input.total == null || !input.date) return empty;
  const near = (amount: number | null, date: string | null) =>
    amount != null && Math.abs(Number(amount) - input.total!) <= 0.01 && !!date && days(date, input.date!) <= 5;
  const probable: DupMatch[] = [
    ...sameNif
      .filter((r) => near(r.extracted_amount, r.extracted_date))
      .map((r) => ({ kind: "probable" as const, reason: "same_nif_total_date", queueItemId: r.id, label: label(r), registeredAt: r.created_at })),
    ...live
      .filter((d) => !skip.has(d.id) && near(d.total_inc_vat, d.issue_date))
      .map((d) => ({ kind: "probable" as const, reason: "same_nif_total_date_live", documentId: d.id, label: liveLabel(d), registeredAt: d.created_at })),
    ...livePayments
      .filter((p) => !skip.has(p.id) && near(p.amount, p.payment_date))
      .map((p) => ({ kind: "probable" as const, reason: "same_payment_live", documentId: p.id, label: p.label, registeredAt: p.created_at })),
  ].slice(0, 5);
  return { exact: null, probable };
}

/** Columns written on a queue row for a duplicate / possible duplicate result. */
export function duplicateColumns(res: { exact: DupMatch | null; probable: DupMatch[] }) {
  if (res.exact) {
    return {
      status: "duplicate",
      duplicate_kind: res.exact.kind,
      duplicate_reason: res.exact.reason,
      duplicate_of_id: res.exact.queueItemId ?? null,
      duplicate_of_document_id: res.exact.documentId ?? null,
      possible_duplicates: null,
    };
  }
  return {
    duplicate_kind: null,
    duplicate_reason: null,
    duplicate_of_id: null,
    duplicate_of_document_id: null,
    possible_duplicates: res.probable.length ? res.probable : null,
  };
}

export { pairOf };
