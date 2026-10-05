import { supabaseAdmin as sb } from "@/integrations/supabase/client.server";
import { findFileDuplicate, checkDocumentDuplicates, duplicateColumns } from "@/lib/finance/intake-duplicates.server";
const APPLY = process.argv.includes("--apply");
const { data: rows } = await sb.from("financial_document_review_queue")
  .select("id, status, created_at, file_sha256, source_file_url, split_of_file_url, intake_type, direction, extracted_supplier_vat, extracted_seller_vat, extracted_buyer_vat, extracted_supplier_name, extracted_seller_name, extracted_document_number, extracted_date, extracted_amount, matched_bank_account_id, extracted_iban, extracted_account_number, extracted_period_start, extracted_period_end")
  .neq("status", "rejected").order("created_at").limit(5000);
const c: Record<string, number> = {}; const inc = (k: string) => (c[k] = (c[k] ?? 0) + 1);
for (const r of rows ?? []) {
  const pending = r.status === "pending_review";
  let res: { exact: any; probable: any[] } = { exact: null, probable: [] };
  if (r.file_sha256) { const fd = await findFileDuplicate({ hash: r.file_sha256, selfId: r.id, storagePath: r.source_file_url, createdBefore: r.created_at }); if (fd) res = { exact: fd, probable: [] }; }
  if (!res.exact) res = await checkDocumentDuplicates({ selfId: r.id, createdBefore: r.created_at, intakeType: r.intake_type, direction: r.direction,
    nif: r.direction === "issued" ? r.extracted_buyer_vat : (r.extracted_supplier_vat ?? r.extracted_seller_vat), supplierName: r.extracted_supplier_name ?? r.extracted_seller_name,
    documentNumber: r.extracted_document_number, date: r.extracted_date, total: r.extracted_amount == null ? null : Number(r.extracted_amount),
    bankAccountId: r.matched_bank_account_id, iban: r.extracted_iban, accountNumber: r.extracted_account_number, periodStart: r.extracted_period_start, periodEnd: r.extracted_period_end });
  if (res.exact) inc(`${pending ? "pending" : r.status}:exact:${res.exact.reason}`);
  else if (res.probable.length) inc(`${pending ? "pending" : r.status}:probable:${res.probable[0].reason}`);
  if (APPLY && pending && (res.exact || res.probable.length)) {
    await sb.from("financial_document_review_queue").update(duplicateColumns(res) as any).eq("id", r.id);
  }
}
// Live purchases: same supplier + normalised number + year.
const { normDocNumber } = await import("@/lib/finance/intake-duplicates.server");
const { data: docs } = await sb.from("financial_documents").select("id, counterparty_supplier_id, document_number, issue_date, total_inc_vat, status").eq("direction", "received").neq("status", "cancelled");
const seen = new Map<string, number>(); let liveDup = 0, liveProb = 0;
for (const d of docs ?? []) { const n = normDocNumber(d.document_number); if (!n || !d.counterparty_supplier_id) continue; const k = `${d.counterparty_supplier_id}|${n}|${d.issue_date?.slice(0,4)}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
for (const v of seen.values()) if (v > 1) liveDup += v - 1;
const list = docs ?? [];
for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i], b = list[j];
  if (a.counterparty_supplier_id && a.counterparty_supplier_id === b.counterparty_supplier_id && Math.abs(Number(a.total_inc_vat) - Number(b.total_inc_vat)) <= 0.01 && a.issue_date && b.issue_date && Math.abs(Date.parse(a.issue_date) - Date.parse(b.issue_date)) <= 5*864e5 && normDocNumber(a.document_number) !== normDocNumber(b.document_number)) liveProb++; }
console.log(JSON.stringify({ rows: rows?.length, counts: c, livePurchases: list.length, liveSameNumberDuplicates: liveDup, liveProbablePairs: liveProb }, null, 1));
