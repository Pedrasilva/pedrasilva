// Accelo Activity Export parser.
//
// Reads the "Activity Export" sheet (or first sheet), detects the header row by
// label, and produces normalized rows. Pure function — no DB writes.

import * as XLSX from "xlsx";

export type AcceloRowKey =
  | "external_id"
  | "from"
  | "to"
  | "company"
  | "reference"
  | "date"
  | "subject"
  | "content"
  | "rate_title"
  | "rate"
  | "billable"
  | "billable_hhmm"
  | "non_billable"
  | "non_billable_hhmm"
  | "amount"
  | "cost"
  | "profit"
  | "status"
  | "invoice_number"
  | "stage"
  | "stage_date_range";

const HEADER_ALIASES: Record<AcceloRowKey, string[]> = {
  external_id: ["id#", "id #", "id"],
  from: ["from"],
  to: ["to"],
  company: ["company"],
  reference: ["reference"],
  date: ["date"],
  subject: ["subject"],
  content: ["content"],
  rate_title: ["rate title"],
  rate: ["rate"],
  billable: ["billable"],
  billable_hhmm: ["billable (hh:mm)"],
  non_billable: ["non-billable", "non billable"],
  non_billable_hhmm: ["non-billable (hh:mm)", "non billable (hh:mm)"],
  amount: ["amount"],
  cost: ["cost"],
  profit: ["profit"],
  status: ["status"],
  invoice_number: ["invoice number", "invoice #", "invoice"],
  stage: ["stage", "milestone", "phase"],
  stage_date_range: [
    "stage date range",
    "milestone date range",
    "stage dates",
    "milestone dates",
    "date range",
  ],
};

// Positional fallbacks (0-indexed): column K = 10 (stage), column O = 14 (date range)
const POSITION_FALLBACK: Partial<Record<AcceloRowKey, number>> = {
  stage: 10,
  stage_date_range: 14,
};

const REQUIRED: AcceloRowKey[] = ["external_id", "from", "date"];

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function extractEmail(s: string): string | null {
  const m = s.match(/<([^>]+@[^>]+)>/) ?? s.match(/([^\s<]+@[^\s>]+)/);
  return m ? m[1].trim().toLowerCase() : null;
}

function extractName(s: string): string {
  const idx = s.indexOf("<");
  return (idx > 0 ? s.slice(0, idx) : s).trim();
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[^\d.,-]/g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y.toString().padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy or yyyy-mm-dd
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [_, a, b, c] = m;
    if (c.length === 2) c = "20" + c;
    return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export type ParsedAcceloRow = {
  rowIndex: number;
  external_id: string;
  from_name: string;
  from_email: string | null;
  to_text: string;
  company: string;
  reference: string;
  entry_date: string | null;
  subject: string;
  content: string;
  rate_title: string;
  rate: number;
  billable_hours: number;
  non_billable_hours: number;
  amount: number;
  cost: number;
  profit: number;
  status_text: string;
  invoice_number: string;
  raw: Record<string, unknown>;
};

export type AcceloParseResult = {
  rows: ParsedAcceloRow[];
  diagnostics: {
    sheetName: string;
    headerRowIndex: number | null;
    resolvedHeaders: Partial<Record<AcceloRowKey, string>>;
    unresolvedRequired: AcceloRowKey[];
    totalDataRows: number;
  };
};

export function parseAcceloActivityExport(buffer: ArrayBuffer): AcceloParseResult {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("activity")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });

  let headerRowIndex: number | null = null;
  let colMap: Partial<Record<AcceloRowKey, number>> = {};

  for (let i = 0; i < Math.min(aoa.length, 25); i++) {
    const row = aoa[i] || [];
    const normalized = row.map((c) => norm(c));
    const candidate: Partial<Record<AcceloRowKey, number>> = {};
    for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [AcceloRowKey, string[]][]) {
      const idx = normalized.findIndex((c) => aliases.includes(c));
      if (idx >= 0) candidate[key] = idx;
    }
    const matched = Object.keys(candidate).length;
    if (matched >= 6 && candidate.external_id !== undefined && candidate.from !== undefined) {
      headerRowIndex = i;
      colMap = candidate;
      break;
    }
  }

  const resolvedHeaders: Partial<Record<AcceloRowKey, string>> = {};
  if (headerRowIndex !== null) {
    const header = aoa[headerRowIndex] || [];
    for (const [k, idx] of Object.entries(colMap) as [AcceloRowKey, number][]) {
      resolvedHeaders[k] = String(header[idx] ?? "");
    }
  }
  const unresolvedRequired = REQUIRED.filter((k) => colMap[k] === undefined);

  const rows: ParsedAcceloRow[] = [];
  if (headerRowIndex !== null && unresolvedRequired.length === 0) {
    const header = aoa[headerRowIndex] || [];
    for (let i = headerRowIndex + 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      if (r.every((c) => c === null || c === undefined || c === "")) continue;
      const get = (k: AcceloRowKey) => (colMap[k] !== undefined ? r[colMap[k]!] : null);
      const fromRaw = String(get("from") ?? "").trim();
      if (!fromRaw && !get("external_id")) continue;
      const raw: Record<string, unknown> = {};
      header.forEach((h, idx) => {
        if (h !== null && h !== undefined && h !== "") raw[String(h)] = r[idx];
      });
      rows.push({
        rowIndex: i + 1,
        external_id: String(get("external_id") ?? "").trim(),
        from_name: extractName(fromRaw),
        from_email: extractEmail(fromRaw),
        to_text: String(get("to") ?? "").trim(),
        company: String(get("company") ?? "").trim(),
        reference: String(get("reference") ?? "").trim(),
        entry_date: toIsoDate(get("date")),
        subject: String(get("subject") ?? "").trim(),
        content: String(get("content") ?? "").trim(),
        rate_title: String(get("rate_title") ?? "").trim(),
        rate: toNumber(get("rate")),
        billable_hours: toNumber(get("billable")),
        non_billable_hours: toNumber(get("non_billable")),
        amount: toNumber(get("amount")),
        cost: toNumber(get("cost")),
        profit: toNumber(get("profit")),
        status_text: String(get("status") ?? "").trim(),
        invoice_number: String(get("invoice_number") ?? "").trim(),
        raw,
      });
    }
  }

  return {
    rows,
    diagnostics: {
      sheetName,
      headerRowIndex,
      resolvedHeaders,
      unresolvedRequired,
      totalDataRows: rows.length,
    },
  };
}
