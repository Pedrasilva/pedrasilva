// Bank statement parser — Millennium BCP Excel format (extensible).
//
// Design rules:
// - Header row detected dynamically by label match, not row index.
// - Column positions resolved by normalized header label.
// - Each row produces a deterministic checksum (account + date + amount + desc + balance)
//   used to dedupe identical lines across re-imports.
// - Pure function: returns parsed rows + diagnostics; no DB writes.

import * as XLSX from "xlsx";

export type BankRowKey =
  | "transaction_date"
  | "value_date"
  | "description"
  | "amount"
  | "running_balance"
  | "currency"
  | "notes"
  | "treated";

export const DEFAULT_BANK_HEADER_ALIASES: Record<BankRowKey, string[]> = {
  transaction_date: ["data lancamento", "data lan amento", "data movimento", "data"],
  value_date: ["data valor", "value date"],
  description: ["descricao", "descri ao", "descrição", "description", "movimento"],
  amount: ["montante", "valor", "amount"],
  running_balance: ["saldo contabilistico", "saldo contab", "saldo", "balance"],
  currency: ["moeda", "currency"],
  notes: ["notas", "observacoes", "obs", "notes"],
  treated: ["tratado", "treated"],
};

export type ParsedBankRow = {
  rowIndex: number; // 1-based source row
  transaction_date: string; // ISO yyyy-mm-dd
  value_date: string | null;
  description: string;
  amount: number;
  running_balance: number | null;
  currency: string;
  notes: string | null;
  raw: Record<string, unknown>;
  row_checksum: string;
};

export type ParseDiagnostics = {
  headerRowIndex: number | null;
  resolvedHeaders: Partial<Record<BankRowKey, string>>;
  unresolvedRequired: BankRowKey[];
  totalDataRows: number;
  skipped: { rowIndex: number; reason: string }[];
  metadata: { accountNumber: string | null; periodStart: string | null; periodEnd: string | null; exportedAt: string | null };
};

export type ParseResult = {
  rows: ParsedBankRow[];
  diagnostics: ParseDiagnostics;
};

const REQUIRED: BankRowKey[] = ["transaction_date", "description", "amount"];

function norm(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Try dd-mm-yyyy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    let year = parseInt(yy, 10);
    if (year < 100) year += 2000;
    const iso = `${year.toString().padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return iso;
  }
  // Try ISO
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  // Handle PT format: "1.234,56" or "1 234,56"; also negatives like "(123,45)"
  const isNeg = /^\(.+\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()€$\s]/g, "").replace(/^-/, "");
  // If both . and , present, treat . as thousands and , as decimal
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return isNeg ? -n : n;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Detect the header row by scanning for normalized matches against required aliases.
 * Returns the 0-based row index in the AOA grid.
 */
function detectHeaderRow(grid: unknown[][], aliases: Record<BankRowKey, string[]>): number {
  const flatAlias = new Set<string>();
  for (const k of REQUIRED) for (const a of aliases[k]) flatAlias.add(a);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const row = grid[i] ?? [];
    let score = 0;
    for (const cell of row) {
      const n = norm(cell);
      if (!n) continue;
      for (const a of flatAlias) {
        if (n === a || n.includes(a) || a.includes(n)) {
          score++;
          break;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  // Need at least 2 of the required headers present
  return bestScore >= 2 ? best : -1;
}

function resolveColumns(
  headerRow: unknown[],
  aliases: Record<BankRowKey, string[]>,
): Partial<Record<BankRowKey, number>> {
  const out: Partial<Record<BankRowKey, number>> = {};
  const normCells = headerRow.map((c) => norm(c));
  for (const key of Object.keys(aliases) as BankRowKey[]) {
    for (const a of aliases[key]) {
      const idx = normCells.findIndex((n) => n === a || n.includes(a));
      if (idx >= 0) {
        out[key] = idx;
        break;
      }
    }
  }
  return out;
}

function extractMetadata(grid: unknown[][], headerRowIdx: number): ParseDiagnostics["metadata"] {
  const meta: ParseDiagnostics["metadata"] = {
    accountNumber: null,
    periodStart: null,
    periodEnd: null,
    exportedAt: null,
  };
  for (let i = 0; i < headerRowIdx; i++) {
    const row = grid[i] ?? [];
    for (let j = 0; j < row.length; j++) {
      const label = norm(row[j]);
      if (!label) continue;
      const next = row[j + 1] ?? row[j]; // value may be in next col or embedded
      const cellStr = String(row[j] ?? "");
      // Account number patterns
      if ((label.includes("conta") || label.includes("nib") || label.includes("iban")) && !meta.accountNumber) {
        const m = cellStr.match(/[\d \-.]{8,}/) || (next ? String(next).match(/[\d \-.]{8,}/) : null);
        if (m) meta.accountNumber = m[0].replace(/\s+/g, "").trim();
      }
      if (label.includes("data") && (label.includes("inicio") || label.includes("de"))) {
        meta.periodStart = toIsoDate(next) ?? meta.periodStart;
      }
      if (label.includes("data") && (label.includes("fim") || label.includes("ate") || label.includes("a "))) {
        meta.periodEnd = toIsoDate(next) ?? meta.periodEnd;
      }
      if (label.includes("export") || label.includes("emiss") || label.includes("extrato")) {
        meta.exportedAt = toIsoDate(next) ?? meta.exportedAt;
      }
    }
  }
  return meta;
}

export async function parseBankStatementWorkbook(
  file: ArrayBuffer | Uint8Array,
  opts?: { aliases?: Record<BankRowKey, string[]>; sheetName?: string },
): Promise<ParseResult> {
  const aliases = opts?.aliases ?? DEFAULT_BANK_HEADER_ALIASES;
  const wb = XLSX.read(file, { type: "array", cellDates: true });
  const sheetName = opts?.sheetName ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }) as unknown[][];

  const headerRowIdx = detectHeaderRow(grid, aliases);
  const diagnostics: ParseDiagnostics = {
    headerRowIndex: headerRowIdx >= 0 ? headerRowIdx + 1 : null,
    resolvedHeaders: {},
    unresolvedRequired: [],
    totalDataRows: 0,
    skipped: [],
    metadata: { accountNumber: null, periodStart: null, periodEnd: null, exportedAt: null },
  };

  if (headerRowIdx < 0) {
    diagnostics.unresolvedRequired = [...REQUIRED];
    return { rows: [], diagnostics };
  }

  const headerRow = grid[headerRowIdx] ?? [];
  const colMap = resolveColumns(headerRow, aliases);
  for (const k of Object.keys(colMap) as BankRowKey[]) {
    const idx = colMap[k]!;
    diagnostics.resolvedHeaders[k] = String(headerRow[idx] ?? "");
  }
  diagnostics.unresolvedRequired = REQUIRED.filter((k) => colMap[k] == null);
  diagnostics.metadata = extractMetadata(grid, headerRowIdx);

  if (diagnostics.unresolvedRequired.length > 0) {
    return { rows: [], diagnostics };
  }

  const rows: ParsedBankRow[] = [];
  for (let i = headerRowIdx + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const isEmpty = r.every((c) => c == null || String(c).trim() === "");
    if (isEmpty) continue;
    diagnostics.totalDataRows++;

    const txDateRaw = r[colMap.transaction_date!];
    const amountRaw = r[colMap.amount!];
    const descRaw = r[colMap.description!];

    const txDate = toIsoDate(txDateRaw);
    const amount = toNumber(amountRaw);
    const desc = descRaw == null ? "" : String(descRaw).trim();

    if (!txDate) { diagnostics.skipped.push({ rowIndex: i + 1, reason: "invalid transaction date" }); continue; }
    if (amount == null) { diagnostics.skipped.push({ rowIndex: i + 1, reason: "invalid amount" }); continue; }
    if (!desc) { diagnostics.skipped.push({ rowIndex: i + 1, reason: "empty description" }); continue; }

    const valueDate = colMap.value_date != null ? toIsoDate(r[colMap.value_date]) : null;
    const balance = colMap.running_balance != null ? toNumber(r[colMap.running_balance]) : null;
    const currency = colMap.currency != null && r[colMap.currency] ? String(r[colMap.currency]).trim().toUpperCase() : "EUR";
    const notes = colMap.notes != null && r[colMap.notes] ? String(r[colMap.notes]).trim() : null;

    const raw: Record<string, unknown> = {};
    for (let j = 0; j < headerRow.length; j++) {
      const h = headerRow[j];
      if (h == null || String(h).trim() === "") continue;
      raw[String(h)] = r[j] ?? null;
    }

    const checksumInput = `${txDate}|${valueDate ?? ""}|${amount.toFixed(2)}|${desc}|${balance ?? ""}|${i + 1}`;
    const row_checksum = await sha256Hex(checksumInput);

    rows.push({
      rowIndex: i + 1,
      transaction_date: txDate,
      value_date: valueDate,
      description: desc,
      amount,
      running_balance: balance,
      currency,
      notes,
      raw,
      row_checksum,
    });
  }

  return { rows, diagnostics };
}

export async function computeFileChecksum(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

// ---- Auto-rule application ---------------------------------------------

export type RuleRow = {
  id: string;
  match_type: "contains" | "starts_with" | "ends_with" | "equals" | "regex";
  pattern: string;
  case_sensitive: boolean;
  classification_id: string | null;
  needs_review: boolean;
  priority: number;
  active: boolean;
};

export type RuleMatch = {
  rule_id: string;
  classification_id: string | null;
  needs_review: boolean;
};

export function applyRules(description: string, rules: RuleRow[]): RuleMatch | null {
  const sorted = [...rules].filter((r) => r.active).sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    const target = r.case_sensitive ? description : description.toLowerCase();
    const pat = r.case_sensitive ? r.pattern : r.pattern.toLowerCase();
    let hit = false;
    switch (r.match_type) {
      case "contains": hit = target.includes(pat); break;
      case "starts_with": hit = target.startsWith(pat); break;
      case "ends_with": hit = target.endsWith(pat); break;
      case "equals": hit = target === pat; break;
      case "regex":
        try { hit = new RegExp(r.pattern, r.case_sensitive ? "" : "i").test(description); } catch { hit = false; }
        break;
    }
    if (hit) {
      return { rule_id: r.id, classification_id: r.classification_id, needs_review: r.needs_review };
    }
  }
  return null;
}
