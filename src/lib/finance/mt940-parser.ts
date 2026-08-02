// MT940 (SWIFT bank statement) parser.
//
// Design rules — this is deliberately NOT a parallel pipeline:
// - Emits the exact same `ParsedBankRow` shape as the Excel importer.
// - Reuses `buildRowChecksum` / `createOccurrenceCounter` from bank-statement-parser.ts
//   so `uniq_bank_tx_account_checksum` protects Excel and MT940 imports equally.
// - All MT940-specific normalization (DDMMYY dates, comma decimals, wrapped :86:
//   descriptions, derived running balance) happens BEFORE hashing, so the checksum
//   inputs are byte-identical to what the Excel path produces for the same transaction.
// - Pure function: returns parsed rows + diagnostics; no DB writes.

import {
  buildRowChecksum,
  createOccurrenceCounter,
  normalizeChecksumDescription,
  type ParseDiagnostics,
  type ParseResult,
  type ParsedBankRow,
} from "./bank-statement-parser";

/** Heuristic content sniffing — banks vary wildly on filename/extension/mime. */
export function looksLikeMt940(text: string): boolean {
  const head = text.slice(0, 8000);
  const hasAccount = /(^|\r?\n)\s*:25[A-Z]?:/.test(head);
  const hasOpening = /(^|\r?\n)\s*:60[FM]:/.test(head);
  const hasStatementLine = /(^|\r?\n)\s*:61:/.test(head);
  const hasRef = /(^|\r?\n)\s*:20:/.test(head);
  // Require a statement line plus at least two other structural tags.
  const score = [hasAccount, hasOpening, hasRef].filter(Boolean).length;
  return hasStatementLine && score >= 2;
}

export function decodeMt940(bytes: Uint8Array): string {
  // MT940 is ASCII/latin-1 in practice; try UTF-8 first and fall back on replacement chars.
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("\uFFFD")) return utf8;
  return new TextDecoder("iso-8859-1").decode(bytes);
}

type Tag = { tag: string; value: string };

/** Split into tags, re-joining continuation lines (lines that do not start with `:NN...:`). */
function tokenize(text: string): Tag[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const tags: Tag[] = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (line === "-" || line === "") continue;
    const m = line.match(/^:(\d{2}[A-Z]?):(.*)$/);
    if (m) {
      tags.push({ tag: m[1], value: m[2] });
    } else if (tags.length > 0) {
      tags[tags.length - 1].value += `\n${line}`;
    }
  }
  return tags;
}

function yymmddToIso(s: string): string | null {
  if (!/^\d{6}$/.test(s)) return null;
  const yy = parseInt(s.slice(0, 2), 10);
  const mm = s.slice(2, 4);
  const dd = s.slice(4, 6);
  const year = 2000 + yy;
  const iso = `${year}-${mm}-${dd}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** :61: entry date is MMDD only — inherit the year from the value date, handling rollover. */
function entryDateIso(valueIso: string, mmdd: string): string | null {
  if (!/^\d{4}$/.test(mmdd)) return null;
  const valueYear = parseInt(valueIso.slice(0, 4), 10);
  const valueMonth = parseInt(valueIso.slice(5, 7), 10);
  const month = parseInt(mmdd.slice(0, 2), 10);
  let year = valueYear;
  if (valueMonth === 12 && month === 1) year = valueYear + 1;
  else if (valueMonth === 1 && month === 12) year = valueYear - 1;
  const iso = `${year}-${mmdd.slice(0, 2)}-${mmdd.slice(2, 4)}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** SWIFT amounts use a comma decimal separator and never thousand separators. */
function swiftAmount(s: string): number | null {
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

type BalanceTag = { iso: string | null; currency: string; amount: number } | null;

function parseBalance(value: string): BalanceTag {
  // e.g. C260101EUR48478,47  /  D260101EUR1234,00
  const m = value.trim().match(/^([CD])(\d{6})([A-Z]{3})([\d.,]+)/);
  if (!m) return null;
  const amount = swiftAmount(m[4]);
  if (amount == null) return null;
  return { iso: yymmddToIso(m[2]), currency: m[3], amount: m[1] === "D" ? -amount : amount };
}

export type Mt940Diagnostics = ParseDiagnostics & {
  metadata: ParseDiagnostics["metadata"] & {
    iban: string | null;
    statementRef: string | null;
    openingBalance: number | null;
    closingBalance: number | null;
    currency: string | null;
  };
};

export type Mt940ParseResult = Omit<ParseResult, "diagnostics"> & { diagnostics: Mt940Diagnostics };

export async function parseMt940(input: string | Uint8Array): Promise<Mt940ParseResult> {
  const text = typeof input === "string" ? input : decodeMt940(input);
  const tags = tokenize(text);

  const diagnostics: Mt940Diagnostics = {
    headerRowIndex: null,
    resolvedHeaders: {},
    unresolvedRequired: [],
    totalDataRows: 0,
    skipped: [],
    metadata: {
      accountNumber: null,
      periodStart: null,
      periodEnd: null,
      exportedAt: null,
      iban: null,
      statementRef: null,
      openingBalance: null,
      closingBalance: null,
      currency: null,
    },
  };

  const rows: ParsedBankRow[] = [];
  const nextOccurrence = createOccurrenceCounter();

  let running: number | null = null;
  let currency = "EUR";
  let ordinal = 0;

  // Group :61: with its following :86: (and any :61: without one).
  const pending: { line: string; details: string[]; info: string | null }[] = [];

  for (const { tag, value } of tags) {
    switch (tag) {
      case "20":
        diagnostics.metadata.statementRef = value.trim() || null;
        break;
      case "25":
      case "25P": {
        const acct = value.split("\n")[0].replace(/\s+/g, "").trim();
        if (acct) {
          diagnostics.metadata.accountNumber = acct;
          const ibanMatch = acct.match(/[A-Z]{2}\d{2}[A-Z0-9]{10,30}/);
          diagnostics.metadata.iban = ibanMatch ? ibanMatch[0] : acct;
        }
        break;
      }
      case "60F":
      case "60M": {
        const b = parseBalance(value);
        if (b) {
          running = b.amount;
          currency = b.currency;
          diagnostics.metadata.currency = b.currency;
          if (diagnostics.metadata.openingBalance == null) diagnostics.metadata.openingBalance = b.amount;
          if (b.iso && !diagnostics.metadata.periodStart) diagnostics.metadata.periodStart = b.iso;
        }
        break;
      }
      case "62F":
      case "62M": {
        const b = parseBalance(value);
        if (b) {
          diagnostics.metadata.closingBalance = b.amount;
          if (b.iso) {
            diagnostics.metadata.periodEnd = b.iso;
            diagnostics.metadata.exportedAt = b.iso;
          }
        }
        break;
      }
      case "61": {
        const [first, ...rest] = value.split("\n");
        pending.push({ line: first, details: rest, info: null });
        break;
      }
      case "86": {
        if (pending.length > 0) {
          const last = pending[pending.length - 1];
          last.info = (last.info ? `${last.info}\n` : "") + value;
        }
        break;
      }
      default:
        break;
    }
  }

  for (const entry of pending) {
    ordinal++;
    diagnostics.totalDataRows++;
    const line = entry.line.trim();
    // :61: valueDate(6) [entryDate(4)] D|C|RD|RC [fundsCode] amount N<type3> ref//bankref
    const m = line.match(/^(\d{6})(\d{4})?(R?[DC])([A-Z])?([\d.,]+)(?:(N.{3})(.*))?$/);
    if (!m) {
      diagnostics.skipped.push({ rowIndex: ordinal, reason: "unparsable :61: statement line" });
      continue;
    }
    const valueIso = yymmddToIso(m[1]);
    if (!valueIso) {
      diagnostics.skipped.push({ rowIndex: ordinal, reason: "invalid value date" });
      continue;
    }
    const txIso = (m[2] ? entryDateIso(valueIso, m[2]) : null) ?? valueIso;
    const magnitude = swiftAmount(m[5]);
    if (magnitude == null) {
      diagnostics.skipped.push({ rowIndex: ordinal, reason: "invalid amount" });
      continue;
    }
    const isDebit = m[3].endsWith("D");
    const amount = isDebit ? -magnitude : magnitude;

    const refs = (m[7] ?? "").trim();
    const infoText = [entry.info ?? "", entry.details.join(" ")].join(" ");
    const desc = normalizeChecksumDescription(
      mt940Description(infoText) || refs || `${m[6] ?? ""} ${refs}`.trim() || "MT940 transaction",
    );
    if (!desc) {
      diagnostics.skipped.push({ rowIndex: ordinal, reason: "empty description" });
      continue;
    }

    running = running == null ? null : Number((running + amount).toFixed(2));
    const balance = running;

    const content = {
      transaction_date: txIso,
      value_date: valueIso,
      amount,
      description: desc,
      running_balance: balance,
    };
    const row_checksum = await buildRowChecksum({ ...content, occurrence: nextOccurrence(content) });

    rows.push({
      rowIndex: ordinal,
      transaction_date: txIso,
      value_date: valueIso,
      description: desc,
      amount,
      running_balance: balance,
      currency,
      notes: null,
      raw: {
        format: "MT940",
        statement_line: line,
        information_to_account_owner: entry.info,
        supplementary_details: entry.details.join(" ") || null,
        transaction_type: m[6] ?? null,
        references: refs || null,
      },
      row_checksum,
    });
  }

  if (rows.length === 0 && diagnostics.totalDataRows === 0) {
    diagnostics.unresolvedRequired = ["transaction_date", "description", "amount"];
  }

  return { rows, diagnostics };
}

/**
 * :86: is often structured (`?20`, `?21`, … subfields). Strip the subfield markers so the
 * description reads like the Excel `Descrição` column instead of raw SWIFT codes.
 */
function mt940Description(info: string): string {
  if (!info.trim()) return "";
  let s = info;
  if (/\?\d{2}/.test(s)) {
    s = s.replace(/^\d{3}/, "").replace(/\?\d{2}/g, " ");
  }
  return s.replace(/\s+/g, " ").trim();
}
