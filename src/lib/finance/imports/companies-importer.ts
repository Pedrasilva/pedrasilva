/**
 * Safe Excel import for canonical `companies` master data (suppliers/clients).
 *
 * Phase 3 — master data only. No documents/payments/statements.
 *
 * Flow: upload file → parse first sheet → detect headers → match against
 * existing companies by NIF → code → name → produce row-level preview →
 * admin commits → writes companies + import_jobs/import_job_rows for audit.
 *
 * Idempotent: re-importing the same file yields the same matches and never
 * overwrites existing non-blank values with blanks.
 */

import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { normalizePortugueseNif, isValidPortugueseNif } from "@/lib/finance/nif";

export type ImportKind = "supplier" | "client";

export type ParsedRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  code: string | null;
  nome: string | null;
  nif: string | null;
  nifValid: boolean;
  abbreviation: string | null;
  morada: string | null;
  postal_code: string | null;
  city: string | null;
  email: string | null;
  telefone: string | null;
  mobile: string | null;
  currency: string | null;
  payment_terms: string | null;
  is_active: boolean | null;
  notas: string | null;
};

export type RowAction = "create" | "update" | "skip" | "conflict" | "invalid";

export type RowPreview = {
  parsed: ParsedRow;
  action: RowAction;
  matchedCompany: {
    id: string;
    nome: string;
    nif: string | null;
    code: string | null;
    is_client: boolean;
    is_supplier: boolean;
  } | null;
  matchedBy: "nif" | "code" | "name" | null;
  errors: string[];
  warnings: string[];
};

export type ImportPreview = {
  filename: string;
  kind: ImportKind;
  storagePath: string | null;
  storageWarning: string | null;
  sheetName: string;
  detectedHeaders: Record<string, string | null>;
  totals: {
    rows: number;
    create: number;
    update: number;
    skip: number;
    conflict: number;
    invalid: number;
  };
  rows: RowPreview[];
};

export type CommitResult = {
  jobId: string;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  invalid: number;
};

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

const FIELD_ALIASES: Record<keyof typeof FIELD_KEYS, string[]> = {
  code: ["codigo", "código", "code", "numero", "número", "nº", "n", "no", "ref", "referencia", "referência"],
  nome: ["nome", "designacao", "designação", "razao social", "razão social", "empresa", "name", "cliente", "fornecedor"],
  nif: ["nif", "contribuinte", "n contribuinte", "no contribuinte", "tax id", "tax number", "vat", "nipc"],
  abbreviation: ["abreviatura", "abrev", "sigla", "short name", "abbreviation"],
  morada: ["morada", "address", "endereco", "endereço", "rua"],
  postal_code: ["codigo postal", "código postal", "cod postal", "cp", "postal code", "zip", "zip code"],
  city: ["localidade", "cidade", "city", "town"],
  email: ["email", "e-mail", "e mail", "correio", "correio eletronico"],
  telefone: ["telefone", "tel", "phone", "tlf", "telephone"],
  mobile: ["telemovel", "telemóvel", "mobile", "movel", "móvel", "cell"],
  currency: ["moeda", "currency", "ccy"],
  payment_terms: [
    "condicoes pagamento",
    "condições pagamento",
    "condicoes de pagamento",
    "condições de pagamento",
    "prazo pagamento",
    "prazo de pagamento",
    "payment terms",
    "termos pagamento",
  ],
  is_active: ["ativo", "activo", "active", "status", "estado", "inativo", "inactivo"],
  notas: ["notas", "observacoes", "observações", "obs", "notes", "comentarios", "comentários"],
};

const FIELD_KEYS = {
  code: 1, nome: 1, nif: 1, abbreviation: 1, morada: 1, postal_code: 1,
  city: 1, email: 1, telefone: 1, mobile: 1, currency: 1, payment_terms: 1,
  is_active: 1, notas: 1,
} as const;

type FieldKey = keyof typeof FIELD_KEYS;

function normHeader(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:#º°\-_/\\()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectHeaders(headerRow: unknown[]): Record<FieldKey, number | null> {
  const out = {} as Record<FieldKey, number | null>;
  const normalized = headerRow.map(normHeader);
  for (const key of Object.keys(FIELD_KEYS) as FieldKey[]) {
    out[key] = null;
    const aliases = FIELD_ALIASES[key].map(normHeader);
    for (let i = 0; i < normalized.length; i++) {
      if (out[key] != null) break;
      const h = normalized[i];
      if (!h) continue;
      if (aliases.includes(h)) { out[key] = i; break; }
    }
    // fallback: partial match
    if (out[key] == null) {
      for (let i = 0; i < normalized.length; i++) {
        const h = normalized[i];
        if (!h) continue;
        if (aliases.some((a) => h === a || h.startsWith(a + " ") || h.endsWith(" " + a))) {
          out[key] = i; break;
        }
      }
    }
  }
  return out;
}

function findHeaderRowIndex(rows: unknown[][]): number {
  // Scan up to first 15 rows for one that contains at least 2 known headers
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const d = detectHeaders(rows[i] ?? []);
    const hits = Object.values(d).filter((v) => v != null).length;
    if (hits >= 2 && d.nome != null) return i;
  }
  return 0;
}

function cellStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseBoolean(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "sim", "yes", "y", "s", "ativo", "activo", "active"].includes(s)) return true;
  if (["0", "false", "nao", "não", "no", "n", "inativo", "inactivo", "inactive"].includes(s)) return false;
  return null;
}

function parseRow(
  row: unknown[],
  headers: Record<FieldKey, number | null>,
  rowNumber: number,
): ParsedRow {
  const get = (k: FieldKey): unknown => (headers[k] != null ? row[headers[k]!] : null);
  const rawNif = cellStr(get("nif"));
  const nif = normalizePortugueseNif(rawNif);
  const currency = cellStr(get("currency"));
  const raw: Record<string, unknown> = {};
  for (const k of Object.keys(FIELD_KEYS) as FieldKey[]) {
    const idx = headers[k];
    if (idx != null) raw[k] = row[idx];
  }
  return {
    rowNumber,
    raw,
    code: cellStr(get("code")),
    nome: cellStr(get("nome")),
    nif,
    nifValid: nif ? isValidPortugueseNif(nif) : false,
    abbreviation: cellStr(get("abbreviation")),
    morada: cellStr(get("morada")),
    postal_code: cellStr(get("postal_code")),
    city: cellStr(get("city")),
    email: cellStr(get("email"))?.toLowerCase() ?? null,
    telefone: cellStr(get("telefone")),
    mobile: cellStr(get("mobile")),
    currency: currency ? currency.toUpperCase().slice(0, 8) : null,
    payment_terms: cellStr(get("payment_terms")),
    is_active: parseBoolean(get("is_active")),
    notas: cellStr(get("notas")),
  };
}

function normName(s: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?'"()\-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export async function uploadAndPreviewCompanies(
  file: File,
  kind: ImportKind,
): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Empty workbook — no sheets found.");
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null });
  if (rows.length < 2) throw new Error("Sheet has no data rows.");

  const headerIdx = findHeaderRowIndex(rows);
  const headers = detectHeaders(rows[headerIdx] ?? []);
  if (headers.nome == null) {
    throw new Error("Could not detect a 'Name' column. Check the file header row.");
  }

  const dataRows = rows.slice(headerIdx + 1);
  const parsed: ParsedRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i] ?? [];
    if (r.every((c) => c == null || String(c).trim() === "")) continue;
    const p = parseRow(r, headers, headerIdx + 2 + i); // human-friendly 1-based row
    if (!p.nome && !p.nif && !p.code) continue; // skip totally blank
    parsed.push(p);
  }

  // Lookup existing companies for matching
  const nifs = Array.from(new Set(parsed.map((p) => p.nif).filter((n): n is string => !!n)));
  const codes = Array.from(new Set(parsed.map((p) => p.code).filter((c): c is string => !!c)));
  const [byNifQ, byCodeQ] = await Promise.all([
    nifs.length
      ? supabase.from("companies").select("id, nome, nif, code, is_client, is_supplier").in("nif", nifs)
      : Promise.resolve({ data: [], error: null } as { data: ExistingCompany[]; error: null }),
    codes.length
      ? supabase.from("companies").select("id, nome, nif, code, is_client, is_supplier").in("code", codes)
      : Promise.resolve({ data: [], error: null } as { data: ExistingCompany[]; error: null }),
  ]);
  if (byNifQ.error) throw byNifQ.error;
  if (byCodeQ.error) throw byCodeQ.error;

  // Also pull by normalized name for last-resort match
  const allNames = Array.from(new Set(parsed.map((p) => p.nome).filter((n): n is string => !!n)));
  let byNameRows: ExistingCompany[] = [];
  if (allNames.length) {
    // Pull a broad slice — admin-only, but still cap
    const { data } = await supabase
      .from("companies")
      .select("id, nome, nif, code, is_client, is_supplier")
      .in("nome", allNames);
    byNameRows = (data ?? []) as ExistingCompany[];
  }

  const nifMap = new Map<string, ExistingCompany>();
  for (const r of (byNifQ.data ?? []) as ExistingCompany[]) if (r.nif) nifMap.set(r.nif, r);
  const codeMap = new Map<string, ExistingCompany>();
  for (const r of (byCodeQ.data ?? []) as ExistingCompany[]) if (r.code) codeMap.set(r.code, r);
  const nameMap = new Map<string, ExistingCompany>();
  for (const r of byNameRows) nameMap.set(normName(r.nome), r);

  // Own-company guard
  const { data: ownSettings } = await supabase
    .from("pm_invoice_settings")
    .select("company_nif")
    .order("singleton", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ownNif = normalizePortugueseNif(ownSettings?.company_nif ?? null);

  const previewRows: RowPreview[] = parsed.map((p) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!p.nome) errors.push("Missing name");
    if (p.nif && !p.nifValid) warnings.push("Invalid Portuguese NIF (will be ignored for matching)");

    let matched: ExistingCompany | null = null;
    let matchedBy: RowPreview["matchedBy"] = null;

    if (p.nif && p.nifValid && nifMap.has(p.nif)) {
      matched = nifMap.get(p.nif) ?? null;
      matchedBy = "nif";
      if (p.code && matched && matched.code && matched.code !== p.code) {
        warnings.push(`Code conflict: existing "${matched.code}" vs imported "${p.code}"`);
      }
    } else if (p.code && codeMap.has(p.code)) {
      matched = codeMap.get(p.code) ?? null;
      matchedBy = "code";
      if (p.nif && p.nifValid && matched && matched.nif && matched.nif !== p.nif) {
        warnings.push(
          `NIF conflict: existing "${matched.nif}" vs imported "${p.nif}" — review before commit`,
        );
      }
    } else if (p.nome && nameMap.has(normName(p.nome))) {
      matched = nameMap.get(normName(p.nome)) ?? null;
      matchedBy = "name";
      if (p.nif && p.nifValid && matched && matched.nif && matched.nif !== p.nif) {
        warnings.push("Name match but NIF differs — not auto-merged");
        matched = null;
        matchedBy = null;
      }
    }

    // Own-company guard
    if (kind === "supplier" && p.nif && p.nifValid && ownNif && p.nif === ownNif) {
      errors.push("Refusing to import own company NIF as a supplier");
    }

    let action: RowAction;
    if (errors.length) action = "invalid";
    else if (warnings.some((w) => w.includes("conflict"))) action = "conflict";
    else if (matched) action = "update";
    else action = "create";

    return {
      parsed: p,
      action,
      matchedCompany: matched,
      matchedBy,
      errors,
      warnings,
    };
  });

  // Upload original file to import-files bucket (best-effort)
  const userRes = await supabase.auth.getUser();
  const uid = userRes.data.user?.id;
  const storagePath = `${uid ?? "anon"}/${Date.now()}-${file.name}`;
  let uploadedPath: string | null = null;
  let storageWarning: string | null = null;
  const up = await supabase.storage.from("import-files").upload(storagePath, file, {
    contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: false,
  });
  if (!up.error) uploadedPath = storagePath;
  else storageWarning = up.error.message;

  const totals = {
    rows: previewRows.length,
    create: previewRows.filter((r) => r.action === "create").length,
    update: previewRows.filter((r) => r.action === "update").length,
    skip: previewRows.filter((r) => r.action === "skip").length,
    conflict: previewRows.filter((r) => r.action === "conflict").length,
    invalid: previewRows.filter((r) => r.action === "invalid").length,
  };

  const detectedHeaders: Record<string, string | null> = {};
  for (const k of Object.keys(FIELD_KEYS) as FieldKey[]) {
    const idx = headers[k];
    detectedHeaders[k] = idx != null ? String((rows[headerIdx] ?? [])[idx] ?? "") : null;
  }

  return {
    filename: file.name,
    kind,
    storagePath: uploadedPath,
    storageWarning,
    sheetName,
    detectedHeaders,
    totals,
    rows: previewRows,
  };
}

type ExistingCompany = {
  id: string;
  nome: string;
  nif: string | null;
  code: string | null;
  is_client: boolean;
  is_supplier: boolean;
};

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export type CommitOptions = {
  /** Include rows currently flagged as "conflict" (will update existing match). */
  includeConflicts: boolean;
  /** Allow overwriting an existing non-blank code with the imported code. */
  overwriteExistingCodes: boolean;
};

/** Build patch keeping existing non-blank values (skip blanks). */
function buildUpdatePatch(p: ParsedRow, existing: ExistingCompany, opts: CommitOptions, kind: ImportKind) {
  const patch: Record<string, unknown> = {};
  const setIf = (k: string, v: unknown) => {
    if (v == null || v === "" || (typeof v === "string" && !v.trim())) return;
    patch[k] = v;
  };

  setIf("nome", p.nome);
  setIf("abbreviation", p.abbreviation);
  setIf("morada", p.morada);
  setIf("postal_code", p.postal_code);
  setIf("city", p.city);
  setIf("email", p.email);
  setIf("telefone", p.telefone);
  setIf("mobile", p.mobile);
  setIf("currency", p.currency);
  setIf("payment_terms", p.payment_terms);
  setIf("notas", p.notas);
  if (p.is_active != null) patch.is_active = p.is_active;

  // NIF: only set if existing is blank and imported is valid
  if (p.nif && p.nifValid && !existing.nif) patch.nif = p.nif;

  // Code: only set if existing is blank, OR explicitly allowed
  if (p.code) {
    if (!existing.code) patch.code = p.code;
    else if (opts.overwriteExistingCodes && existing.code !== p.code) patch.code = p.code;
  }

  // Role flags — preserve existing, add the import-kind role
  if (kind === "supplier" && !existing.is_supplier) patch.is_supplier = true;
  if (kind === "client" && !existing.is_client) patch.is_client = true;

  return patch;
}

function buildInsertRow(p: ParsedRow, kind: ImportKind) {
  return {
    nome: p.nome!,
    nif: p.nif && p.nifValid ? p.nif : null,
    code: p.code, // blank → trigger auto-generates
    abbreviation: p.abbreviation,
    morada: p.morada,
    postal_code: p.postal_code,
    city: p.city,
    email: p.email,
    telefone: p.telefone,
    mobile: p.mobile,
    currency: p.currency || "EUR",
    payment_terms: p.payment_terms,
    notas: p.notas,
    is_active: p.is_active ?? true,
    is_supplier: kind === "supplier",
    is_client: kind === "client",
  };
}

export async function commitCompaniesImport(
  preview: ImportPreview,
  opts: CommitOptions,
): Promise<CommitResult> {
  const userRes = await supabase.auth.getUser();
  const uid = userRes.data.user?.id ?? null;

  // Create import job
  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .insert({
      import_type: "companies_clients_suppliers",
      source_system: "manual_xlsx",
      original_filename: preview.filename,
      storage_path: preview.storagePath,
      status: "imported",
      row_count: preview.totals.rows,
      metadata: { kind: preview.kind, sheet: preview.sheetName, detectedHeaders: preview.detectedHeaders } as never,
      created_by: uid,
    })
    .select("id")
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message ?? "Failed to create import job");

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let conflicts = 0;
  let invalid = 0;

  const auditRows: Array<{
    import_job_id: string;
    row_number: number;
    raw_data: Record<string, unknown>;
    parsed_data: Record<string, unknown>;
    status: "imported" | "skipped" | "error" | "warning";
    external_id: string | null;
    error_message: string | null;
    warning_message: string | null;
  }> = [];

  for (const row of preview.rows) {
    const p = row.parsed;
    let status: "imported" | "skipped" | "error" | "warning" = "imported";
    let resultId: string | null = row.matchedCompany?.id ?? null;
    let errorMsg: string | null = null;

    if (row.action === "invalid") {
      invalid++;
      status = "error";
      errorMsg = row.errors.join("; ");
    } else if (row.action === "skip") {
      skipped++;
      status = "skipped";
    } else if (row.action === "conflict" && !opts.includeConflicts) {
      conflicts++;
      status = "skipped";
      errorMsg = row.warnings.join("; ");
    } else if (row.action === "update" || (row.action === "conflict" && opts.includeConflicts)) {
      const patch = row.matchedCompany
        ? buildUpdatePatch(p, row.matchedCompany, opts, preview.kind)
        : null;
      if (!patch || Object.keys(patch).length === 0) {
        skipped++;
        status = "skipped";
      } else {
        const { error } = await supabase
          .from("companies")
          .update(patch as never)
          .eq("id", row.matchedCompany!.id);
        if (error) {
          status = "error";
          errorMsg = error.message;
          invalid++;
        } else {
          updated++;
        }
      }
    } else if (row.action === "create") {
      const insertRow = buildInsertRow(p, preview.kind);
      const { data: ins, error } = await supabase
        .from("companies")
        .insert(insertRow)
        .select("id")
        .single();
      if (error) {
        status = "error";
        errorMsg = error.message;
        invalid++;
      } else {
        created++;
        resultId = ins?.id ?? null;
      }
    }

    auditRows.push({
      import_job_id: job.id,
      row_number: p.rowNumber,
      raw_data: p.raw,
      parsed_data: {
        action: row.action,
        matchedBy: row.matchedBy,
        matchedCompanyId: row.matchedCompany?.id ?? null,
        resultId,
        parsed: p,
      } as Record<string, unknown>,
      status,
      external_id: p.nif ?? p.code ?? null,
      error_message: errorMsg,
      warning_message: row.warnings.length ? row.warnings.join("; ") : null,
    });
  }

  // Insert audit rows (chunked)
  for (let i = 0; i < auditRows.length; i += 500) {
    const slice = auditRows.slice(i, i + 500);
    await supabase.from("import_job_rows").insert(slice as never);
  }

  await supabase
    .from("import_jobs")
    .update({
      imported_count: created + updated,
      skipped_count: skipped + conflicts,
      error_count: invalid,
      warning_count: preview.rows.filter((r) => r.warnings.length).length,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return { jobId: job.id, created, updated, skipped, conflicts, invalid };
}
