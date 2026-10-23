/**
 * One-off backfill: re-read pending bank statements (both entities) so their
 * figures are filled and draft statement periods are created by the database.
 * Movements and matches are never touched. Usage: bun scripts/backfill-statement-drafts.ts
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reprocessQueueItem } from "@/lib/finance/doc-intake.server";

const { data, error } = await supabaseAdmin
  .from("financial_document_review_queue")
  .select("id, original_filename")
  .eq("intake_type", "extrato_bancario")
  .eq("status", "pending_review")
  .is("statement_period_id", null);
if (error) throw error;
console.log("to re-read:", data?.length ?? 0);
for (const r of data ?? []) {
  const t = Date.now();
  const res = await reprocessQueueItem(r.id);
  console.log(r.id, r.original_filename, res.ok ? "ok" : `FAIL ${res.error}`, `${Math.round((Date.now() - t) / 1000)}s`);
}
console.log("done");
