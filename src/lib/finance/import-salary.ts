// Salary import — parses payroll rows from an Excel-like row source and
// writes effective-dated snapshots into `salary_snapshots`.
//
// Design rules (see src/lib/finance/import-reference.md):
// - Header-driven: column positions are resolved by normalized header label,
//   never by fixed indices, so the parser survives Excel layout edits.
// - Match collaborators by normalized email first, then normalized name.
// - Create missing collaborators ONLY when both name AND a contact field
//   (email or numero_colaborador) are present. Otherwise skip and log.
// - Each imported row is a NEW snapshot (immutability trigger enforces this
//   server-side; we never UPDATE financial fields on existing rows).
// - Source = "excel_import"; import_log_id links back to financial_import_logs.
// - Skipped rows are recorded in the import log `notes` field.
//
// The parser does not own header lists — it accepts an `aliases` map so the
// caller (UI / CLI) can extend it as the actual file is inspected.

import { supabase } from "@/integrations/supabase/client";
import {
  computeFileChecksum,
  recordFinancialImportLog,
  type FinancialImportLogRow,
} from "@/lib/finance/import-logs";
import { defaultSnapshot } from "@/lib/salary";

// ---- Header alias map ---------------------------------------------------

export type SalaryColumnKey =
  | "nome"
  | "email"
  | "numero_colaborador"
  | "valor_base"
  | "subsidio_alimentacao_diario"
  | "ss_atelier_pct"
  | "ss_colaborador_pct"
  | "irs_pct"
  | "meses_pagos"
  | "ajudas_custo_anual"
  | "beneficio_carro"
  | "beneficio_ticket"
  | "premio_associado"
  | "outros_beneficios"
  | "beneficio_variavel"
  | "effective_from"
  | "notas";

/**
 * Default aliases, normalized (lowercased + accent-stripped). Extend per file.
 * Keys are SalaryColumnKey, values are accepted Excel header variants.
 */
export const DEFAULT_SALARY_HEADER_ALIASES: Record<SalaryColumnKey, string[]> = {
  nome: ["nome", "colaborador", "name", "employee"],
  email: ["email", "e-mail", "mail"],
  numero_colaborador: ["numero", "n colaborador", "n. colaborador", "id colaborador", "n"],
  valor_base: ["salario base", "salario", "base", "valor base", "vencimento", "base salary"],
  subsidio_alimentacao_diario: [
    "subsidio alimentacao",
    "sub. alimentacao",
    "sa",
    "alimentacao diaria",
    "meal allowance",
  ],
  ss_atelier_pct: ["tsu", "ss atelier", "seg. social atelier", "employer ss", "ss patronal"],
  ss_colaborador_pct: ["ss colaborador", "seg. social colaborador", "employee ss"],
  irs_pct: ["irs", "irs pct", "retencao irs"],
  meses_pagos: ["meses", "n meses", "meses pagos", "months"],
  ajudas_custo_anual: ["ajudas de custo", "ajudas custo", "per diem", "ajudas custo anual"],
  beneficio_carro: ["carro", "viatura", "car"],
  beneficio_ticket: ["ticket", "vale", "voucher"],
  premio_associado: ["premio", "premio associado", "bonus"],
  outros_beneficios: ["outros beneficios", "outros", "other benefits"],
  beneficio_variavel: ["variavel", "beneficio variavel", "variable"],
  effective_from: ["data inicio", "inicio", "vigencia", "effective from", "since"],
  notas: ["notas", "observacoes", "notes"],
};

// ---- Normalization ------------------------------------------------------

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeLabel = (s: string): string =>
  stripAccents(String(s ?? "")).trim().toLowerCase().replace(/\s+/g, " ").replace(/[._-]/g, " ").trim();

export const normalizeEmail = (s: string | null | undefined): string =>
  String(s ?? "").trim().toLowerCase();

export const normalizeName = (s: string | null | undefined): string =>
  normalizeLabel(String(s ?? "")).replace(/[^a-z0-9 ]/g, "").trim();

// ---- Header resolution --------------------------------------------------

export type HeaderMap = Partial<Record<SalaryColumnKey, number>>;

export function resolveHeaders(
  headerRow: string[],
  aliases: Record<SalaryColumnKey, string[]> = DEFAULT_SALARY_HEADER_ALIASES,
): HeaderMap {
  const normalized = headerRow.map((h) => normalizeLabel(h ?? ""));
  const map: HeaderMap = {};
  (Object.keys(aliases) as SalaryColumnKey[]).forEach((key) => {
    const candidates = aliases[key].map(normalizeLabel);
    const idx = normalized.findIndex(
      (h) => h.length > 0 && candidates.some((c) => h === c || h.includes(c)),
    );
    if (idx >= 0) map[key] = idx;
  });
  return map;
}

/**
 * Scan the first N rows of a sheet (array-of-arrays) and pick the row that
 * resolves the highest number of known salary columns. Returns the 1-based
 * row number (suitable for the UI input). Falls back to 1 when no row scores.
 */
export function autoDetectHeaderRow(
  rows: (string | number | null)[][],
  aliases: Record<SalaryColumnKey, string[]> = DEFAULT_SALARY_HEADER_ALIASES,
  scanRows = 20,
): { headerRowNum: number; score: number } {
  const limit = Math.min(scanRows, rows.length);
  let best = { headerRowNum: 1, score: 0 };
  for (let i = 0; i < limit; i++) {
    const headerCandidate = (rows[i] ?? []).map((v) => String(v ?? "").trim());
    const map = resolveHeaders(headerCandidate, aliases);
    const score = Object.keys(map).length;
    if (score > best.score) best = { headerRowNum: i + 1, score };
  }
  return best;
}

// ---- Value parsing ------------------------------------------------------

const toNumber = (raw: unknown): number => {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  // Accept "1 234,56" / "1.234,56€" / "12.5%" / negatives in parens
  let s = String(raw).trim().replace(/[€\s]/g, "");
  const isPercent = s.endsWith("%");
  if (isPercent) s = s.slice(0, -1);
  const isNeg = /^\(.*\)$/.test(s);
  if (isNeg) s = s.slice(1, -1);
  // Remove thousands sep (.) when comma is present as decimal sep
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return (isNeg ? -n : n) * (isPercent ? 0.01 : 1);
};

const toDate = (raw: unknown): string | null => {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
};

// ---- Public API ---------------------------------------------------------

export type SalaryImportRow = (string | number | null)[];

export type SalaryImportInput = {
  fileName: string;
  fileBlob?: Blob; // optional; used to compute checksum
  headerRow: string[];
  dataRows: SalaryImportRow[];
  /** Default effective_from when the row has none. Defaults to today. */
  defaultEffectiveFrom?: string;
  /** When true, missing collaborators are created automatically when name + (email or numero) is present. */
  createMissing?: boolean;
  /** Optional overrides/extensions to the default header alias map. */
  headerAliases?: Record<SalaryColumnKey, string[]>;
};

export type SalaryImportSkip = {
  rowIndex: number; // 0-based, relative to dataRows
  reason: string;
  identifier: string; // best-effort name/email for log readability
};

// ---- Preview (dry-run) --------------------------------------------------

export type SalaryPreviewMatch = {
  rowIndex: number; // 0-based, relative to dataRows
  identifier: string;
  collaboratorId: string;
  matchedBy: "email" | "name";
  matchedLabel: string; // existing collaborator nome / email
  valor_base: number;
  effective_from: string;
};

export type SalaryPreviewWillCreate = {
  rowIndex: number;
  identifier: string;
  nome: string;
  email: string | null;
  numero_colaborador: string | null;
  valor_base: number;
  effective_from: string;
};

/** Per-row validation warning (does not block import). */
export type SalaryRowWarning =
  | "missing_email"
  | "salary_too_low"
  | "salary_too_high"
  | "invalid_effective_date"
  | "duplicate_in_file"
  | "no_change_vs_current";

/** Reasonable sanity bounds for monthly base salary, in EUR. */
export const SALARY_BOUNDS = { min: 600, max: 25_000 } as const;

export type SalaryPreviewResult =
  | {
      status: "ready";
      headers: HeaderMap;
      headerRow: string[];
      matches: SalaryPreviewMatch[];
      willCreate: SalaryPreviewWillCreate[];
      skipped: SalaryImportSkip[];
      /** Warnings keyed by rowIndex (0-based, relative to dataRows). */
      warnings: Record<number, SalaryRowWarning[]>;
      duplicateOfImport?: { imported_at: string; file_name: string };
      checksum: string | null;
    }
  | { status: "error"; message: string };

/**
 * Dry-run: parse rows, resolve headers, classify each row as match / will-create / skip.
 * Performs ZERO writes. Used by the UI to render the confirmation step.
 */
export async function previewSalaryImport(
  input: SalaryImportInput,
): Promise<SalaryPreviewResult> {
  const aliases = input.headerAliases ?? DEFAULT_SALARY_HEADER_ALIASES;
  const headers = resolveHeaders(input.headerRow, aliases);
  const today = new Date().toISOString().slice(0, 10);
  const defaultEff = input.defaultEffectiveFrom ?? today;

  if (headers.nome == null && headers.email == null) {
    return {
      status: "error",
      message: "Header row must contain at least a name or email column.",
    };
  }
  if (headers.valor_base == null) {
    return {
      status: "error",
      message: "Header row must contain a base salary column (e.g. 'Salário Base').",
    };
  }

  const { data: collaborators, error: collabErr } = await supabase
    .from("collaborators")
    .select("id, nome, email, numero_colaborador");
  if (collabErr) {
    return { status: "error", message: `Failed to load collaborators: ${collabErr.message}` };
  }
  const byEmail = new Map<string, { id: string; label: string }>();
  const byName = new Map<string, { id: string; label: string }>();
  for (const c of collaborators ?? []) {
    if (c.email) byEmail.set(normalizeEmail(c.email), { id: c.id, label: c.nome ?? c.email });
    if (c.nome) byName.set(normalizeName(c.nome), { id: c.id, label: c.nome });
  }

  // Duplicate-import check (does NOT write a log row)
  const checksum = input.fileBlob ? await computeFileChecksum(input.fileBlob) : null;
  let duplicateOfImport: { imported_at: string; file_name: string } | undefined;
  if (checksum) {
    const { data: prior } = await supabase
      .from("financial_import_logs")
      .select("imported_at, file_name")
      .eq("import_type", "salary_excel")
      .eq("file_checksum", checksum)
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior) duplicateOfImport = prior as { imported_at: string; file_name: string };
  }

  const cell = (row: SalaryImportRow, key: SalaryColumnKey): unknown => {
    const idx = headers[key];
    return idx == null ? undefined : row[idx];
  };

  // Load current open snapshots per collaborator to flag duplicate effective_from
  // and "no change vs current" warnings (read-only).
  const { data: openSnaps } = await supabase
    .from("salary_snapshots")
    .select("collaborator_id, effective_from, valor_base")
    .is("effective_to", null);
  const currentByCollab = new Map<string, { effective_from: string; valor_base: number }>();
  for (const s of openSnaps ?? []) {
    currentByCollab.set(s.collaborator_id, {
      effective_from: s.effective_from,
      valor_base: Number(s.valor_base ?? 0),
    });
  }

  const matches: SalaryPreviewMatch[] = [];
  const willCreate: SalaryPreviewWillCreate[] = [];
  const skipped: SalaryImportSkip[] = [];
  const warnings: Record<number, SalaryRowWarning[]> = {};
  const addWarn = (i: number, w: SalaryRowWarning) => {
    if (!warnings[i]) warnings[i] = [];
    if (!warnings[i].includes(w)) warnings[i].push(w);
  };

  // Track duplicate (collaboratorId, effective_from) pairs within the file
  const seenPairs = new Map<string, number>(); // key → first rowIndex

  for (let i = 0; i < input.dataRows.length; i++) {
    const row = input.dataRows[i];
    const nameRaw = String(cell(row, "nome") ?? "").trim();
    const emailRaw = String(cell(row, "email") ?? "").trim();
    const numeroRaw = String(cell(row, "numero_colaborador") ?? "").trim();
    const baseRaw = cell(row, "valor_base");
    const identifier = emailRaw || nameRaw || `row ${i + 1}`;

    if (!nameRaw && !emailRaw && !numeroRaw && (baseRaw == null || baseRaw === "")) continue;

    const valorBase = toNumber(baseRaw);
    if (valorBase <= 0) {
      skipped.push({ rowIndex: i, identifier, reason: "Missing or non-positive base salary" });
      continue;
    }

    // Effective-from: invalid date is a critical skip (would corrupt history).
    const effRaw = cell(row, "effective_from");
    const effParsed = headers.effective_from != null && effRaw != null && String(effRaw).trim() !== ""
      ? toDate(effRaw)
      : defaultEff;
    if (!effParsed) {
      skipped.push({ rowIndex: i, identifier, reason: "Invalid effective date" });
      continue;
    }
    const effectiveFrom = effParsed;

    // Soft warnings — do not block
    if (valorBase < SALARY_BOUNDS.min) addWarn(i, "salary_too_low");
    if (valorBase > SALARY_BOUNDS.max) addWarn(i, "salary_too_high");
    if (!emailRaw) addWarn(i, "missing_email");

    const emailKey = normalizeEmail(emailRaw);
    const nameKey = normalizeName(nameRaw);
    const emailHit = emailKey ? byEmail.get(emailKey) : undefined;
    const nameHit = !emailHit && nameKey ? byName.get(nameKey) : undefined;
    const hit = emailHit ?? nameHit;

    if (hit) {
      const dupKey = `${hit.id}|${effectiveFrom}`;
      if (seenPairs.has(dupKey)) addWarn(i, "duplicate_in_file");
      else seenPairs.set(dupKey, i);
      const cur = currentByCollab.get(hit.id);
      if (cur && cur.effective_from === effectiveFrom && Math.abs(cur.valor_base - valorBase) < 0.005) {
        addWarn(i, "no_change_vs_current");
      }
      matches.push({
        rowIndex: i,
        identifier,
        collaboratorId: hit.id,
        matchedBy: emailHit ? "email" : "name",
        matchedLabel: hit.label,
        valor_base: valorBase,
        effective_from: effectiveFrom,
      });
      continue;
    }

    const enoughIdentity = nameRaw && (emailRaw || numeroRaw);
    if (input.createMissing && enoughIdentity) {
      willCreate.push({
        rowIndex: i,
        identifier,
        nome: nameRaw,
        email: emailRaw || null,
        numero_colaborador: numeroRaw || null,
        valor_base: valorBase,
        effective_from: effectiveFrom,
      });
      continue;
    }
    skipped.push({
      rowIndex: i,
      identifier,
      reason: !nameRaw
        ? "Unknown collaborator (no name and no email match)"
        : "Unknown collaborator (cannot create — need name + email or employee number)",
    });
  }

  return {
    status: "ready",
    headers,
    headerRow: input.headerRow,
    matches,
    willCreate,
    skipped,
    warnings,
    duplicateOfImport,
    checksum,
  };
}

export type SalaryImportResult =
  | {
      status: "duplicate";
      message: string;
      existing_import: { imported_at: string; file_name: string };
    }
  | {
      status: "completed";
      log: FinancialImportLogRow;
      inserted: number;
      skipped: SalaryImportSkip[];
      createdCollaborators: number;
    }
  | { status: "error"; message: string; skipped?: SalaryImportSkip[] };

export async function importSalarySnapshots(
  input: SalaryImportInput,
): Promise<SalaryImportResult> {
  const aliases = input.headerAliases ?? DEFAULT_SALARY_HEADER_ALIASES;
  const headers = resolveHeaders(input.headerRow, aliases);
  const today = new Date().toISOString().slice(0, 10);
  const defaultEff = input.defaultEffectiveFrom ?? today;

  // Validate minimum headers
  if (headers.nome == null && headers.email == null) {
    return {
      status: "error",
      message:
        "Header row must contain at least a name or email column. Update DEFAULT_SALARY_HEADER_ALIASES if your file uses a non-standard label.",
    };
  }
  if (headers.valor_base == null) {
    return {
      status: "error",
      message: "Header row must contain a base salary column (e.g. 'Salário Base').",
    };
  }

  // Load existing collaborators once for matching
  const { data: collaborators, error: collabErr } = await supabase
    .from("collaborators")
    .select("id, nome, email, numero_colaborador");
  if (collabErr) {
    return { status: "error", message: `Failed to load collaborators: ${collabErr.message}` };
  }
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of collaborators ?? []) {
    if (c.email) byEmail.set(normalizeEmail(c.email), c.id);
    if (c.nome) byName.set(normalizeName(c.nome), c.id);
  }

  // Compute checksum + create the import log shell first so we have an id
  const checksum = input.fileBlob ? await computeFileChecksum(input.fileBlob) : null;
  const logResult = await recordFinancialImportLog({
    import_type: "salary_excel",
    file_name: input.fileName,
    file_checksum: checksum,
    source_file_size_bytes: input.fileBlob?.size ?? null,
    rows_salary_snapshots: 0, // updated after inserts below
    notes: null,
  });

  if (logResult.status === "duplicate") {
    return {
      status: "duplicate",
      message: logResult.message,
      existing_import: logResult.existing_import,
    };
  }
  if (logResult.status === "error") {
    return { status: "error", message: logResult.message };
  }

  const log = logResult.log;
  const skipped: SalaryImportSkip[] = [];
  let inserted = 0;
  let createdCollaborators = 0;

  // Helper to read a cell by header key
  const cell = (row: SalaryImportRow, key: SalaryColumnKey): unknown => {
    const idx = headers[key];
    return idx == null ? undefined : row[idx];
  };

  for (let i = 0; i < input.dataRows.length; i++) {
    const row = input.dataRows[i];
    const nameRaw = String(cell(row, "nome") ?? "").trim();
    const emailRaw = String(cell(row, "email") ?? "").trim();
    const numeroRaw = String(cell(row, "numero_colaborador") ?? "").trim();
    const baseRaw = cell(row, "valor_base");
    const identifier = emailRaw || nameRaw || `row ${i + 1}`;

    // Skip empty rows silently
    if (!nameRaw && !emailRaw && !numeroRaw && (baseRaw == null || baseRaw === "")) {
      continue;
    }

    const valorBase = toNumber(baseRaw);
    if (valorBase <= 0) {
      skipped.push({
        rowIndex: i,
        identifier,
        reason: "Missing or non-positive base salary",
      });
      continue;
    }

    // Resolve collaborator
    let collaboratorId: string | undefined;
    const emailKey = normalizeEmail(emailRaw);
    const nameKey = normalizeName(nameRaw);
    if (emailKey && byEmail.has(emailKey)) collaboratorId = byEmail.get(emailKey);
    if (!collaboratorId && nameKey && byName.has(nameKey)) collaboratorId = byName.get(nameKey);

    if (!collaboratorId) {
      const enoughIdentity = nameRaw && (emailRaw || numeroRaw);
      if (!input.createMissing || !enoughIdentity) {
        skipped.push({
          rowIndex: i,
          identifier,
          reason: !nameRaw
            ? "No name and no matching collaborator by email"
            : "No matching collaborator and not enough identity to create one (need name + email or employee number)",
        });
        continue;
      }
      const { data: created, error: createErr } = await supabase
        .from("collaborators")
        .insert({
          nome: nameRaw,
          email: emailRaw || null,
          numero_colaborador: numeroRaw || null,
        })
        .select("id, nome, email")
        .single();
      if (createErr || !created) {
        skipped.push({
          rowIndex: i,
          identifier,
          reason: `Failed to create collaborator: ${createErr?.message ?? "unknown"}`,
        });
        continue;
      }
      collaboratorId = created.id;
      createdCollaborators++;
      if (created.email) byEmail.set(normalizeEmail(created.email), created.id);
      if (created.nome) byName.set(normalizeName(created.nome), created.id);
    }

    const effectiveFrom = toDate(cell(row, "effective_from")) ?? defaultEff;

    const seed = defaultSnapshot(collaboratorId!, "Excel import", true);
    const payload = {
      ...seed,
      collaborator_id: collaboratorId!,
      reference_date: effectiveFrom,
      effective_from: effectiveFrom,
      effective_to: null,
      source: "excel_import" as const,
      import_log_id: log.id,
      label: `Excel ${effectiveFrom}`,
      valor_base: valorBase,
      subsidio_alimentacao_diario:
        toNumber(cell(row, "subsidio_alimentacao_diario")) || seed.subsidio_alimentacao_diario,
      ss_atelier_pct: headers.ss_atelier_pct != null
        ? toNumber(cell(row, "ss_atelier_pct"))
        : seed.ss_atelier_pct,
      ss_colaborador_pct: headers.ss_colaborador_pct != null
        ? toNumber(cell(row, "ss_colaborador_pct"))
        : seed.ss_colaborador_pct,
      irs_pct: headers.irs_pct != null ? toNumber(cell(row, "irs_pct")) : seed.irs_pct,
      meses_pagos: headers.meses_pagos != null
        ? Math.max(12, Math.round(toNumber(cell(row, "meses_pagos"))))
        : seed.meses_pagos,
      ajudas_custo_anual: toNumber(cell(row, "ajudas_custo_anual")),
      beneficio_carro: toNumber(cell(row, "beneficio_carro")),
      beneficio_ticket: toNumber(cell(row, "beneficio_ticket")),
      premio_associado: toNumber(cell(row, "premio_associado")),
      outros_beneficios: toNumber(cell(row, "outros_beneficios")),
      beneficio_variavel: toNumber(cell(row, "beneficio_variavel")),
      notas: String(cell(row, "notas") ?? "").trim() || null,
    };

    const { error: insErr } = await supabase
      .from("salary_snapshots")
      .insert(payload);
    if (insErr) {
      skipped.push({
        rowIndex: i,
        identifier,
        reason: `Insert failed: ${insErr.message}`,
      });
      continue;
    }
    inserted++;
  }

  // Update log counters + skipped notes
  const notes =
    skipped.length === 0
      ? null
      : `Skipped ${skipped.length} row(s):\n` +
        skipped
          .map((s) => `  • row ${s.rowIndex + 1} (${s.identifier}): ${s.reason}`)
          .join("\n");
  await supabase
    .from("financial_import_logs")
    .update({ rows_salary_snapshots: inserted, notes })
    .eq("id", log.id);

  return {
    status: "completed",
    log: { ...log, rows_salary_snapshots: inserted, notes },
    inserted,
    skipped,
    createdCollaborators,
  };
}
