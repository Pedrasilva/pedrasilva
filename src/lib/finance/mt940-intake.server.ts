/**
 * MT940 email ingestion — server side.
 *
 * Deliberately reuses the manual-upload pipeline end to end:
 *  - rows come from `parseMt940`, which emits the same `ParsedBankRow` shape and uses the
 *    canonical `buildRowChecksum` from bank-statement-parser.ts;
 *  - every import is logged to `bank_statement_imports`, so email-sourced imports appear in
 *    "Manage imports" next to manual ones (and can be undone the same way);
 *  - rows land in `bank_transactions` as `unclassified`, with the same auto-rule pre-fill;
 *  - duplicates are rejected by the existing `uniq_bank_tx_account_checksum` index.
 */
import {
  applyRules,
  computeFileChecksum,
  type RuleRow,
} from "./bank-statement-parser";
import { looksLikeMt940, decodeMt940, parseMt940 } from "./mt940-parser";

export { looksLikeMt940, decodeMt940 };

const BUCKET = "financial-documents";

function normalizeIban(v: string | null | undefined): string {
  return (v ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export type Mt940IngestResult =
  | { ok: true; status: "imported"; importId: string; accountId: string; rowsTotal: number; rowsImported: number; rowsDuplicate: number; storagePath: string }
  | { ok: false; status: "unmatched_account" | "not_mt940" | "no_rows" | "duplicate_file" | "error"; reason: string; iban?: string | null; storagePath?: string };

/**
 * Ingest one MT940 file. `bytes` is the raw attachment; nothing is ever silently dropped —
 * the raw file is stored first, and unresolved cases return a status the caller surfaces.
 */
export async function ingestMt940File(args: {
  bytes: Uint8Array;
  fileName: string;
  storagePathHint: string;
  importedBy?: string | null;
}): Promise<Mt940IngestResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const text = decodeMt940(args.bytes);
  if (!looksLikeMt940(text)) {
    return { ok: false, status: "not_mt940", reason: "content does not look like MT940" };
  }

  // 1. Always retain the raw file, before anything can fail.
  const storagePath = args.storagePathHint;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, args.bytes, { contentType: "text/plain", upsert: true });
  if (upErr) {
    return { ok: false, status: "error", reason: `upload failed: ${upErr.message}` };
  }

  const parse = await parseMt940(text);
  const iban = parse.diagnostics.metadata.iban ?? parse.diagnostics.metadata.accountNumber;

  // 2. Resolve the account strictly by IBAN — never guess.
  const { data: accounts, error: accErr } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, iban, account_number")
    .is("archived_at", null);
  if (accErr) return { ok: false, status: "error", reason: accErr.message, storagePath };

  const target = normalizeIban(iban);
  const match = target
    ? (accounts ?? []).find(
        (a) => normalizeIban(a.iban) === target || normalizeIban(a.account_number) === target,
      )
    : undefined;

  if (!match) {
    return { ok: false, status: "unmatched_account", reason: "no bank account matches the :25: IBAN", iban, storagePath };
  }
  if (parse.rows.length === 0) {
    return { ok: false, status: "no_rows", reason: "no :61: statement lines parsed", iban, storagePath };
  }

  // 3. File-level + row-level dedupe, identical to the manual path.
  const fileChecksum = await computeFileChecksum(new Blob([args.bytes as unknown as BlobPart]));
  const checksums = parse.rows.map((r) => r.row_checksum);
  const existing = new Set<string>();
  for (let i = 0; i < checksums.length; i += 300) {
    const { data } = await supabaseAdmin
      .from("bank_transactions")
      .select("row_checksum")
      .eq("bank_account_id", match.id)
      .in("row_checksum", checksums.slice(i, i + 300));
    (data ?? []).forEach((d) => existing.add(d.row_checksum));
  }
  const newRows = parse.rows.filter((r) => !existing.has(r.row_checksum));

  const { data: rules } = await supabaseAdmin
    .from("bank_classification_rules")
    .select("id, match_type, pattern, case_sensitive, classification_id, needs_review, priority, active")
    .eq("active", true);

  // The same file already imported for this account (identical constraint the manual
  // upload warns about) — report it instead of hitting the unique index.
  const { data: fileDup } = await supabaseAdmin
    .from("bank_statement_imports")
    .select("id, file_name, imported_at")
    .eq("bank_account_id", match.id)
    .eq("file_checksum", fileChecksum)
    .maybeSingle();
  if (fileDup) {
    return {
      ok: false,
      status: "duplicate_file",
      reason: `statement already imported as "${fileDup.file_name}" (${fileDup.imported_at})`,
      iban,
      storagePath,
    };
  }

  // 4. Log the import exactly like a manual upload (same table, same fields).

  const { data: importLog, error: logErr } = await supabaseAdmin
    .from("bank_statement_imports")
    .insert({
      bank_account_id: match.id,
      file_name: args.fileName,
      file_checksum: fileChecksum,
      source_file_size_bytes: args.bytes.byteLength,
      period_start: parse.diagnostics.metadata.periodStart,
      period_end: parse.diagnostics.metadata.periodEnd,
      exported_at: parse.diagnostics.metadata.exportedAt,
      rows_total: parse.diagnostics.totalDataRows,
      rows_imported: 0,
      rows_skipped: parse.diagnostics.skipped.length,
      status: "imported",
      imported_by: args.importedBy ?? null,
      notes: `MT940 via email intake${parse.diagnostics.skipped.length ? ` — ${parse.diagnostics.skipped.length} lines skipped` : ""} — ${storagePath}`,
    })
    .select("id")
    .single();
  if (logErr) return { ok: false, status: "error", reason: logErr.message, iban, storagePath };

  const inserts = newRows.map((r) => ({
    bank_account_id: match.id,
    statement_import_id: importLog.id,
    transaction_date: r.transaction_date,
    value_date: r.value_date,
    description: r.description,
    amount: r.amount,
    running_balance: r.running_balance,
    currency: r.currency,
    notes: r.notes,
    raw_row: r.raw as never,
    row_checksum: r.row_checksum,
    status: "unclassified" as const,
    suggested_classification_id:
      applyRules(r.description, (rules ?? []) as unknown as RuleRow[])?.classification_id ?? null,
  }));

  let inserted = 0;
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { error: insErr, count } = await supabaseAdmin
      .from("bank_transactions")
      .insert(chunk, { count: "exact" });
    if (insErr) {
      if (insErr.code !== "23505") {
        await supabaseAdmin
          .from("bank_statement_imports")
          .update({ rows_imported: inserted, notes: `MT940 via email intake — insert error: ${insErr.message}` })
          .eq("id", importLog.id);
        return { ok: false, status: "error", reason: insErr.message, iban, storagePath };
      }
    }
    inserted += count ?? 0;
  }

  await supabaseAdmin
    .from("bank_statement_imports")
    .update({ rows_imported: inserted })
    .eq("id", importLog.id);

  return {
    ok: true,
    status: "imported",
    importId: importLog.id,
    accountId: match.id,
    rowsTotal: parse.rows.length,
    rowsImported: inserted,
    rowsDuplicate: parse.rows.length - newRows.length,
    storagePath,
  };
}
