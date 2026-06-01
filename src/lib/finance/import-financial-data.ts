import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side duplicate-safe financial import.
 *
 * Wraps the `public.import_financial_data` Postgres function, which:
 *   1. Verifies the caller is admin
 *   2. Pre-checks `financial_import_logs` by (import_type, file_checksum)
 *   3. Inserts all rows in a single transaction
 *   4. Records the import log; translates 23505 race into a duplicate response
 *
 * Auth: requireSupabaseAuth ensures the caller has a valid JWT (defense in
 * depth at the function boundary), and the RPC is invoked through the
 * user-scoped client so `auth.uid()` resolves correctly for the admin check
 * inside the SECURITY DEFINER function.
 */

export type FinancialImportPayload = {
  import_type?: string; // default 'excel_seed'
  file_name: string;
  file_checksum: string;
  source_file_size_bytes?: number | null;
  notes?: string | null;
  suppliers?: unknown[];
  clients?: unknown[];
  bank_accounts?: unknown[];
  debts?: unknown[];
  periods?: unknown[];
  expenses?: unknown[];
  income?: unknown[];
};

export type ImportFinancialDataResult =
  | {
      status: "inserted";
      log_id: string;
      rows: {
        suppliers: number;
        clients: number;
        bank_accounts: number;
        debts: number;
        expenses: number;
        income: number;
      };
    }
  | {
      status: "duplicate";
      message: string;
      existing_import: { imported_at: string; file_name: string };
    }
  | { status: "error"; message: string };

function validatePayload(input: unknown): FinancialImportPayload {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid payload");
  }
  const p = input as FinancialImportPayload;
  if (!p.file_name || typeof p.file_name !== "string") {
    throw new Error("file_name is required");
  }
  if (!p.file_checksum || typeof p.file_checksum !== "string") {
    throw new Error("file_checksum is required");
  }
  return p;
}

export const importFinancialData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validatePayload)
  .handler(async ({ data, context }): Promise<ImportFinancialDataResult> => {
    // Always use the caller's JWT-scoped client; the RPC's SECURITY DEFINER
    // admin check relies on auth.uid() and would see NULL with service-role.
    const client = context.supabase;

    const { data: rpcData, error } = await client.rpc("import_financial_data", {
      p_import_type: data.import_type ?? "excel_seed",
      p_file_name: data.file_name,
      p_file_checksum: data.file_checksum,
      p_source_file_size_bytes: data.source_file_size_bytes ?? undefined,
      p_notes: data.notes ?? undefined,
      p_suppliers: (data.suppliers ?? []) as never,
      p_clients: (data.clients ?? []) as never,
      p_bank_accounts: (data.bank_accounts ?? []) as never,
      p_debts: (data.debts ?? []) as never,
      p_periods: (data.periods ?? []) as never,
      p_expenses: (data.expenses ?? []) as never,
      p_income: (data.income ?? []) as never,
    });

    if (error) {
      const isDuplicateRace =
        error.code === "23505" ||
        (typeof error.message === "string" && error.message.includes("duplicate_import"));

      if (isDuplicateRace) {
        const detail = (error as { details?: string }).details;
        if (detail) {
          try {
            const parsed = JSON.parse(detail);
            if (parsed && parsed.status === "duplicate") {
              return parsed as ImportFinancialDataResult;
            }
          } catch {
            // fall through
          }
        }
        return {
          status: "duplicate",
          message: "This file has already been imported",
          existing_import: {
            imported_at: new Date().toISOString(),
            file_name: data.file_name,
          },
        };
      }

      return {
        status: "error",
        message: error.message ?? "Failed to import financial data",
      };
    }

    return rpcData as ImportFinancialDataResult;
  });
