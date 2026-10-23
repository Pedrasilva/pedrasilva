/**
 * Bank document registry rules (pure, browser-safe).
 *
 * Every statement shows the balances printed on the document next to the Hub's
 * figures for the same period: printed opening + imported movements = computed
 * closing; difference = printed closing − computed closing.
 * Values are always the effective (corrected) ones stored on the queue row.
 */

export const BALANCE_TOLERANCE = 0.005;

export const BANK_DOC_KINDS = ["account_statement", "card_statement", "bank_export", "other_bank"] as const;
export type BankDocKind = (typeof BANK_DOC_KINDS)[number];

export const STATEMENT_FIELDS = [
  "bank_doc_kind",
  "matched_bank_account_id",
  "matched_payment_card_id",
  "extracted_statement_number",
  "extracted_period_start",
  "extracted_period_end",
  "extracted_opening_balance",
  "extracted_closing_balance",
  "extracted_total_debits",
  "extracted_total_credits",
  "extracted_card_due_date",
  "extracted_card_amount_to_debit",
] as const;
export type StatementField = (typeof STATEMENT_FIELDS)[number];

export type FieldOverride = { ai: unknown; previous: unknown; value: unknown; by: string | null; at: string };

export type BankDocRow = {
  id: string;
  status: string;
  bank_doc_kind: BankDocKind | null;
  extracted_bank_name: string | null;
  matched_bank_account_id: string | null;
  matched_payment_card_id: string | null;
  extracted_statement_number: string | null;
  extracted_period_start: string | null;
  extracted_period_end: string | null;
  extracted_opening_balance: number | null;
  extracted_closing_balance: number | null;
  extracted_total_debits: number | null;
  extracted_total_credits: number | null;
  extracted_card_due_date: string | null;
  extracted_card_amount_to_debit: number | null;
  extracted_statement_card_last4: string | null;
  bank_identity_flag: string | null;
  bank_ai_values: Record<string, unknown> | null;
  bank_field_overrides: Record<string, FieldOverride> | null;
  statement_period_id: string | null;
  source_file_url: string | null;
  source_bucket: string | null;
  original_filename: string | null;
  bank_period: string | null;
  created_at: string;
};

export const isStatementKind = (k: string | null | undefined) =>
  k === "account_statement" || k === "card_statement";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type HubComparison = {
  printedOpening: number | null;
  printedClosing: number | null;
  movements: number;
  computedClosing: number | null;
  difference: number | null;
  matches: boolean | null;
};

/** Printed opening + Hub movements = computed closing; compared with the printed closing. */
export function hubComparison(
  opening: number | null | undefined,
  closing: number | null | undefined,
  hubTotal: number | null | undefined,
): HubComparison {
  const o = opening == null ? null : Number(opening);
  const c = closing == null ? null : Number(closing);
  const m = r2(Number(hubTotal ?? 0));
  const computed = o == null ? null : r2(o + m);
  const diff = computed == null || c == null ? null : r2(c - computed);
  return {
    printedOpening: o,
    printedClosing: c,
    movements: m,
    computedClosing: computed,
    difference: diff,
    matches: diff == null ? null : Math.abs(diff) <= BALANCE_TOLERANCE,
  };
}

const live = (r: BankDocRow) => r.status !== "removed" && r.status !== "rejected";
const docKey = (r: BankDocRow) =>
  r.bank_doc_kind === "card_statement" && r.matched_payment_card_id
    ? `card:${r.matched_payment_card_id}`
    : r.matched_bank_account_id
      ? `acc:${r.matched_bank_account_id}`
      : null;

/** Same account (or card) + same period → the other documents. */
export function findDuplicates(rows: BankDocRow[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    if (!live(r) || !isStatementKind(r.bank_doc_kind)) continue;
    const k = docKey(r);
    if (!k || !r.extracted_period_start || !r.extracted_period_end) continue;
    const key = `${k}|${r.extracted_period_start}|${r.extracted_period_end}`;
    groups.set(key, [...(groups.get(key) ?? []), r.id]);
  }
  const out = new Map<string, string[]>();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) out.set(id, ids.filter((x) => x !== id));
  }
  return out;
}

const monthOf = (iso: string) => iso.slice(0, 7);
function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function statementsByKey(rows: BankDocRow[]) {
  const by = new Map<string, BankDocRow[]>();
  for (const r of rows) {
    if (!live(r) || r.status === "duplicate" || !isStatementKind(r.bank_doc_kind)) continue;
    const k = docKey(r);
    if (!k || !r.extracted_period_start || !r.extracted_period_end) continue;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  for (const list of by.values()) {
    list.sort((a, b) => a.extracted_period_start!.localeCompare(b.extracted_period_start!));
  }
  return by;
}

/** Months with no statement between two statements of the same account/card. */
export function findGaps(rows: BankDocRow[]): Array<{ key: string; months: string[] }> {
  const out: Array<{ key: string; months: string[] }> = [];
  for (const [key, list] of statementsByKey(rows)) {
    const covered = new Set<string>();
    for (const r of list) {
      let m = monthOf(r.extracted_period_start!);
      const end = monthOf(r.extracted_period_end!);
      while (m <= end) { covered.add(m); m = nextMonth(m); }
    }
    const months: string[] = [];
    for (let i = 1; i < list.length; i++) {
      let m = nextMonth(monthOf(list[i - 1].extracted_period_end!));
      const stop = monthOf(list[i].extracted_period_start!);
      while (m < stop) { if (!covered.has(m)) months.push(m); m = nextMonth(m); }
    }
    if (months.length) out.push({ key, months: [...new Set(months)] });
  }
  return out;
}

/** Opening balance must equal the previous statement's closing balance. */
export function continuityBreaks(
  rows: BankDocRow[],
): Map<string, { previousId: string; previousClosing: number; opening: number; difference: number }> {
  const out = new Map<string, { previousId: string; previousClosing: number; opening: number; difference: number }>();
  for (const list of statementsByKey(rows).values()) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      if (prev.extracted_closing_balance == null || cur.extracted_opening_balance == null) continue;
      const d = r2(Number(cur.extracted_opening_balance) - Number(prev.extracted_closing_balance));
      if (Math.abs(d) > BALANCE_TOLERANCE) {
        out.set(cur.id, {
          previousId: prev.id,
          previousClosing: Number(prev.extracted_closing_balance),
          opening: Number(cur.extracted_opening_balance),
          difference: d,
        });
      }
    }
  }
  return out;
}

/** Only fields whose value changed, ready for fin_bank_statement_save. */
export function changedFields(
  row: Partial<Record<StatementField, unknown>>,
  draft: Partial<Record<StatementField, unknown>>,
): Partial<Record<StatementField, unknown>> {
  const out: Partial<Record<StatementField, unknown>> = {};
  for (const f of STATEMENT_FIELDS) {
    if (!(f in draft)) continue;
    const a = row[f] ?? null;
    const b = draft[f] === "" ? null : draft[f] ?? null;
    const same = typeof a === "number" || typeof b === "number"
      ? (a == null && b == null) || (a != null && b != null && Number(a) === Number(b))
      : a === b;
    if (!same) out[f] = b;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Draft statement periods (bulk confirmation in Entrada > Banco)
// ---------------------------------------------------------------------------

/** Hub statement ID: account/card code + MM/YYYY of the period end (+ -n when several in a month). */
export function statementPeriodCode(base: string, periodEnd: string, suffix?: number | null): string {
  const [y, m] = periodEnd.split("-");
  return `${base}${m}/${y}${suffix ? `-${suffix}` : ""}`;
}

export type AiReadings = {
  opening?: { claude?: number | null; gemini?: number | null; differ?: boolean };
  closing?: { claude?: number | null; gemini?: number | null; differ?: boolean };
} | null;

export type PeriodLite = {
  id: string;
  bank_account_id: string;
  payment_card_id: string | null;
  statement_number: string;
  period_start_date: string;
  period_end_date: string;
  opening_balance: number;
  closing_balance: number;
  status: "draft" | "confirmed";
  balance_disagreement: boolean;
  ai_readings: AiReadings;
  attached_documents: Record<string, { differences?: string[] }> | null;
};

export type DraftCheck = {
  aiAgree: boolean;
  /** null = no earlier period to compare with. */
  continuity: { ok: boolean; previousClosing: number; difference: number } | null;
  attachedDifferences: boolean;
  /** Green: AI agree, continuity holds (or first period), no attached differences. */
  passes: boolean;
};

/** Checks for a pending period against the previous period of the same account/card. */
export function draftCheck(p: PeriodLite, all: PeriodLite[]): DraftCheck {
  const prev = all
    .filter((o) => o.id !== p.id && o.bank_account_id === p.bank_account_id
      && (o.payment_card_id ?? null) === (p.payment_card_id ?? null)
      && o.period_end_date < p.period_start_date)
    .sort((a, b) => b.period_end_date.localeCompare(a.period_end_date))[0];
  const continuity = prev
    ? (() => {
        const d = r2(Number(p.opening_balance) - Number(prev.closing_balance));
        return { ok: Math.abs(d) <= BALANCE_TOLERANCE, previousClosing: Number(prev.closing_balance), difference: d };
      })()
    : null;
  const attachedDifferences = Object.values(p.attached_documents ?? {}).some((a) => (a.differences ?? []).length > 0);
  const aiAgree = !p.balance_disagreement;
  return { aiAgree, continuity, attachedDifferences, passes: aiAgree && (continuity?.ok ?? true) && !attachedDifferences };
}
