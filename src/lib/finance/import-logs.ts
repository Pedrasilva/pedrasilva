import { supabase } from "@/integrations/supabase/client";

/**
 * Financial import log helpers.
 *
 * Pairs with the partial unique index
 *   uniq_financial_import_logs_type_checksum
 *     ON public.financial_import_logs (import_type, file_checksum)
 *     WHERE file_checksum IS NOT NULL
 *
 * to make duplicate imports safe and explicit instead of bubbling Postgres
 * error 23505 to the caller.
 */

export type FinancialImportLogInput = {
  import_type?: string; // defaults to 'excel_seed' in DB
  file_name: string;
  file_checksum: string | null;
  source_file_size_bytes?: number | null;
  rows_expenses?: number;
  rows_income?: number;
  rows_suppliers?: number;
  rows_clients?: number;
  rows_debts?: number;
  rows_bank_accounts?: number;
  rows_salary_snapshots?: number;
  notes?: string | null;
};

export type FinancialImportLogRow = {
  id: string;
  import_type: string;
  file_name: string;
  file_checksum: string | null;
  source_file_size_bytes: number | null;
  imported_at: string;
  rows_expenses: number;
  rows_income: number;
  rows_suppliers: number;
  rows_clients: number;
  rows_debts: number;
  rows_bank_accounts: number;
  rows_salary_snapshots: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DuplicateImportInfo = {
  imported_at: string;
  file_name: string;
};

export type RecordImportLogResult =
  | { status: "inserted"; log: FinancialImportLogRow }
  | {
      status: "duplicate";
      message: string;
      existing_import: DuplicateImportInfo;
      existing: FinancialImportLogRow;
    }
  | { status: "error"; message: string };

const DUPLICATE_PG_CODE = "23505";
const DUPLICATE_INDEX_NAME = "uniq_financial_import_logs_type_checksum";

/**
 * Look up an existing import log row for the same (import_type, file_checksum).
 * Returns null when no match exists, or when checksum is null (cannot dedupe).
 */
export async function findExistingImportByChecksum(
  importType: string,
  fileChecksum: string | null,
): Promise<FinancialImportLogRow | null> {
  if (!fileChecksum) return null;

  const { data, error } = await supabase
    .from("financial_import_logs")
    .select("*")
    .eq("import_type", importType)
    .eq("file_checksum", fileChecksum)
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Surface as null and let the insert path handle/translate the real failure.
    return null;
  }
  return (data as FinancialImportLogRow) ?? null;
}

/**
 * Insert a financial import log with duplicate-detection.
 *
 * Flow:
 *   1. If a checksum is provided, look it up first; return `duplicate` on hit.
 *   2. Otherwise insert. If the unique index still fires (race), translate
 *      the 23505 error into the same `duplicate` shape by re-querying.
 *
 * Callers MUST gate the actual import work on `result.status === "inserted"`.
 */
export async function recordFinancialImportLog(
  input: FinancialImportLogInput,
): Promise<RecordImportLogResult> {
  const importType = input.import_type ?? "excel_seed";

  // 1. Pre-check
  const existing = await findExistingImportByChecksum(
    importType,
    input.file_checksum,
  );
  if (existing) {
    return {
      status: "duplicate",
      message: "This file has already been imported",
      existing_import: {
        imported_at: existing.imported_at,
        file_name: existing.file_name,
      },
      existing,
    };
  }

  // 2. Insert
  const { data, error } = await supabase
    .from("financial_import_logs")
    .insert({
      import_type: importType,
      file_name: input.file_name,
      file_checksum: input.file_checksum,
      source_file_size_bytes: input.source_file_size_bytes ?? null,
      rows_expenses: input.rows_expenses ?? 0,
      rows_income: input.rows_income ?? 0,
      rows_suppliers: input.rows_suppliers ?? 0,
      rows_clients: input.rows_clients ?? 0,
      rows_debts: input.rows_debts ?? 0,
      rows_bank_accounts: input.rows_bank_accounts ?? 0,
      rows_salary_snapshots: input.rows_salary_snapshots ?? 0,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (!error && data) {
    return { status: "inserted", log: data as FinancialImportLogRow };
  }

  // 3. Translate unique-violation race into structured duplicate response
  const isDuplicateViolation =
    error?.code === DUPLICATE_PG_CODE ||
    (error?.message?.includes(DUPLICATE_INDEX_NAME) ?? false);

  if (isDuplicateViolation) {
    const racedExisting = await findExistingImportByChecksum(
      importType,
      input.file_checksum,
    );
    if (racedExisting) {
      return {
        status: "duplicate",
        message: "This file has already been imported",
        existing_import: {
          imported_at: racedExisting.imported_at,
          file_name: racedExisting.file_name,
        },
        existing: racedExisting,
      };
    }
    return {
      status: "duplicate",
      message: "This file has already been imported",
      existing_import: {
        imported_at: new Date().toISOString(),
        file_name: input.file_name,
      },
      existing: {
        id: "",
        import_type: importType,
        file_name: input.file_name,
        file_checksum: input.file_checksum,
        source_file_size_bytes: input.source_file_size_bytes ?? null,
        imported_at: new Date().toISOString(),
        rows_expenses: 0,
        rows_income: 0,
        rows_suppliers: 0,
        rows_clients: 0,
        rows_debts: 0,
        rows_bank_accounts: 0,
        rows_salary_snapshots: 0,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
  }

  return {
    status: "error",
    message: error?.message ?? "Failed to record import log",
  };
}

/**
 * Compute the SHA-256 hex checksum of a file in the browser. Use this to
 * populate `file_checksum` before calling `recordFinancialImportLog`.
 */
export async function computeFileChecksum(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
