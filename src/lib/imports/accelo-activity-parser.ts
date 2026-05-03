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

function cleanDateInput(v: unknown): string {
  return String(v ?? "")
    // strip zero-width and BOM
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // normalize all dash variants and arrows to ASCII hyphen
    .replace(/[\u2010-\u2015\u2212\u2192\u27F6]/g, "-")
    // non-breaking spaces → regular space
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excelSerialToIso(n: number): string | null {
  // Try XLSX.SSF first (handles 1900 leap-year bug correctly), fall back to math.
  const ssf = (XLSX as unknown as { SSF?: { parse_date_code?: (n: number) => { y: number; m: number; d: number } | null } }).SSF;
  const d = ssf?.parse_date_code?.(n);
  if (d) {
    return `${d.y.toString().padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  // Excel epoch: 1899-12-30 (accounts for the 1900 leap-year bug)
  if (!Number.isFinite(n)) return null;
  const ms = Math.round(n) * 86400000 + Date.UTC(1899, 11, 30);
  const dt = new Date(ms);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return excelSerialToIso(v);
  const s = cleanDateInput(v);
  if (!s) return null;
  // Pure numeric string → Excel serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 1000 && n < 80000) {
      const iso = excelSerialToIso(n);
      if (iso) return iso;
    }
  }
  // YYYY-MM-DD or YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (ymd) {
    const y = +ymd[1], m = +ymd[2], d = +ymd[3];
    if (isValidYmd(y, m, d)) return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // DD/MM/YY or DD/MM/YYYY (also DD-MM-YY[YY], DD.MM.YY[YY])
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (dmy) {
    let a = +dmy[1], b = +dmy[2], c = +dmy[3];
    if (c < 100) c += 2000;
    // Prefer DD/MM (project default = European). Fallback to MM/DD if invalid.
    if (isValidYmd(c, b, a)) return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    if (isValidYmd(c, a, b)) return `${c}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  // Last resort: native Date
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
  /** Raw reference as it appears in the file (may include a stage suffix). */
  reference: string;
  /** Stage-marker stripped reference used as the project identity. */
  parent_reference: string;
  /** Stage name inferred from the reference suffix when the Stage column is empty. */
  inferred_stage_name: string | null;
  /** Where stage_name was sourced from. */
  stage_source: "explicit" | "reference" | "subject" | "content" | "raw" | "none";
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
  stage_name: string;
  stage_date_range_raw: string;
  stage_start_date: string | null;
  stage_end_date: string | null;
  stage_parse_warning: string | null;
  raw: Record<string, unknown>;
};

// Stage-suffix patterns appended to an Accelo "Reference" value, e.g.
//   "2602 Lifetime Penthouse - [2] Concept Design"
//   "Project X — Fase 3 Estudo Prévio"
//   "Project Y - Stage 4: Detail"
const STAGE_SUFFIX_RE =
  /\s*[-–—:]\s*(?:\[\s*\d+[a-zA-Z]?\s*\]|(?:fase|stage|phase|milestone|etapa)\s*[#nº]?\s*\d+[a-zA-Z]?)\s*[-–—:.]?\s*(.*)$/i;

/** True when a string looks like a stage label (used as a guard before
 *  auto-creating a project from a name). */
export function looksLikeStageName(s: string | null | undefined): boolean {
  if (!s) return false;
  return /(^|\s)(\[\s*\d+|fase\s*\d|stage\s*\d|phase\s*\d|milestone\s*\d|etapa\s*\d)/i.test(s);
}

/** Splits an Accelo reference into the parent project identity + optional
 *  stage-name suffix found after the marker. */
export function splitReference(ref: string | null | undefined): {
  parent: string;
  stage: string | null;
} {
  const raw = (ref ?? "").trim();
  if (!raw) return { parent: "", stage: null };
  const m = raw.match(STAGE_SUFFIX_RE);
  if (!m) return { parent: raw, stage: null };
  const parent = raw.slice(0, m.index).trim();
  const stage = (m[1] ?? "").trim() || null;
  return { parent: parent || raw, stage };
}

// Patterns recognized as stage labels inside subject / content / raw fields.
const STAGE_PATTERNS: RegExp[] = [
  /\[\s*\d+[a-zA-Z]?\s*\][^\n\r|;]*/,                        // "[2] Concept Design"
  /\b(?:fase|stage|phase|milestone|etapa)\s*[#nº]?\s*\d+[a-zA-Z]?[^\n\r|;]*/i,
  /\b(?:programa|programme|concept|conceito|estudo\s+pr[ée]vio|projeto\s+de\s+execu[çc][ãa]o|execu[çc][ãa]o|technical\s+design|detalhe|licenciamento|assist[êe]ncia\s+t[ée]cnica)\b[^\n\r|;]*/i,
];

/** Extracts a stage label from free text fields. */
export function extractStageFromText(...sources: (string | null | undefined)[]): {
  stage: string | null;
  source: "subject" | "content" | "raw" | null;
  matchedIn: string | null;
} {
  for (let i = 0; i < sources.length; i++) {
    const text = (sources[i] ?? "").toString();
    if (!text) continue;
    for (const re of STAGE_PATTERNS) {
      const m = text.match(re);
      if (m) {
        const cleaned = m[0].trim().replace(/\s+/g, " ").replace(/[.;,:|]+$/, "").trim();
        if (cleaned) return { stage: cleaned, source: null, matchedIn: text };
      }
    }
  }
  return { stage: null, source: null, matchedIn: null };
}

// Parses stage date ranges in many real-world formats.
// Accepts: "DD/MM/YY to DD/MM/YY", "DD-MM-YYYY - DD-MM-YYYY", "YYYY-MM-DD – YYYY-MM-DD",
// "DD/MM/YY até DD/MM/YY", em-dash separators, Excel serial pairs, etc.
export function parseStageDateRange(input: unknown): {
  start: string | null;
  end: string | null;
  warning: string | null;
} {
  // Native Date / number inputs → treat as single date directly, no splitting.
  if (input instanceof Date) {
    const iso = toIsoDate(input);
    return iso
      ? { start: iso, end: iso, warning: "Single date detected — using same start and end" }
      : { start: null, end: null, warning: "Unparseable date" };
  }
  if (typeof input === "number") {
    const iso = toIsoDate(input);
    return iso
      ? { start: iso, end: iso, warning: "Single date detected — using same start and end" }
      : { start: null, end: null, warning: "Unparseable date" };
  }

  const s = cleanDateInput(input);
  if (!s) return { start: null, end: null, warning: null };

  // Only treat as a range when an explicit separator splits the string in two.
  const sep = s.split(/\s+(?:to|até|a)\s+|\s+-\s+/i);
  if (sep.length === 2) {
    const start = toIsoDate(sep[0]);
    const end = toIsoDate(sep[1]);
    if (start && end) {
      if (start > end) {
        return { start: end, end: start, warning: `Start/end were swapped in: "${s}"` };
      }
      return { start, end, warning: null };
    }
    // One side parsed but not the other → fall through to single-date attempt.
    if (start && !end) {
      return { start, end: start, warning: "Single date detected — using same start and end" };
    }
    if (!start && end) {
      return { start: end, end, warning: "Single date detected — using same start and end" };
    }
    return { start: null, end: null, warning: "Unparseable date" };
  }

  // No range separator — try as a single date.
  const single = toIsoDate(s);
  if (single) {
    return { start: single, end: single, warning: "Single date detected — using same start and end" };
  }

  return { start: null, end: null, warning: "Unparseable date" };
}

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

  // Apply positional fallbacks (e.g. stage at column K, range at column O) when
  // headers are missing/non-standard.
  for (const [k, idx] of Object.entries(POSITION_FALLBACK) as [AcceloRowKey, number][]) {
    if (colMap[k] === undefined) colMap[k] = idx;
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
      const referenceRaw = String(get("reference") ?? "").trim();
      const refSplit = splitReference(referenceRaw);
      const stageColumn = String(get("stage") ?? "").trim();
      rows.push({
        rowIndex: i + 1,
        external_id: String(get("external_id") ?? "").trim(),
        from_name: extractName(fromRaw),
        from_email: extractEmail(fromRaw),
        to_text: String(get("to") ?? "").trim(),
        company: String(get("company") ?? "").trim(),
        reference: referenceRaw,
        parent_reference: refSplit.parent,
        inferred_stage_name: !stageColumn && refSplit.stage ? refSplit.stage : null,
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
        stage_name: stageColumn || refSplit.stage || "",
        stage_date_range_raw: String(get("stage_date_range") ?? "").trim(),
        ...(() => {
          const parsed = parseStageDateRange(get("stage_date_range"));
          return {
            stage_start_date: parsed.start,
            stage_end_date: parsed.end,
            stage_parse_warning: parsed.warning,
          };
        })(),
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
