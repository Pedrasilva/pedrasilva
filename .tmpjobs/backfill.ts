import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decideRecipient, loadPsaIdentity, removeColumns } from "@/lib/finance/recipient-rule.server";
const APPLY = process.argv.includes("--apply");
const psa = await loadPsaIdentity();
const { data: rows, error } = await supabaseAdmin.from("financial_document_review_queue")
  .select("id,status,intake_type,intake_type_source,intake_route,direction,extracted_recipient_name,extracted_recipient_vat,extracted_buyer_name,extracted_buyer_vat,extracted_seller_name,extracted_seller_vat,extracted_supplier_name,extracted_supplier_vat,field_checks,keep_despite_recipient")
  .or("status.eq.pending_review,intake_type.eq.outra_entidade").neq("status","duplicate").neq("status","approved").neq("status","removed").neq("status","rejected");
if (error) throw error;
const out = { kept: 0, triage: 0, skip: 0, removed: 0 } as Record<string, number>;
const byRcp = new Map<string, number>();
for (const r of rows!) {
  const fc = (r.field_checks ?? {}) as any;
  const vat = r.extracted_recipient_vat ?? r.extracted_buyer_vat ?? null;
  const name = r.extracted_recipient_name ?? r.extracted_buyer_name ?? null;
  const d = decideRecipient({ psa, name, vat, sellerName: r.extracted_seller_name ?? r.extracted_supplier_name, sellerVat: r.extracted_seller_vat ?? r.extracted_supplier_vat,
    direction: (r as any).direction ?? "received", type: r.intake_type === "outra_entidade" ? "desconhecido" : r.intake_type,
    forcedType: r.intake_type_source === "manual" && r.intake_type !== "outra_entidade" ? r.intake_type : null,
    verify: fc.recipient_vat?.status === "verify", keep: r.keep_despite_recipient });
  if (d.kind === "psa") { out.kept++; if (r.intake_type === "outra_entidade" && APPLY) await supabaseAdmin.from("financial_document_review_queue").update({ intake_route: "triage", status: "pending_review" }).eq("id", r.id); continue; }
  if (d.kind === "skip") { out.skip++; continue; }
  if (d.kind === "triage") { out.triage++; if (APPLY && r.intake_route !== "triage" && r.intake_route !== "ignored") await supabaseAdmin.from("financial_document_review_queue").update({ intake_route: "triage" }).eq("id", r.id); continue; }
  out.removed++; byRcp.set(d.reason, (byRcp.get(d.reason) ?? 0) + 1);
  if (APPLY) await supabaseAdmin.from("financial_document_review_queue").update(removeColumns({ reason: d.reason, source: "recipient_rule", tag: "not_psa", prevStatus: r.status })).eq("id", r.id);
}
console.log(rows!.length, out); console.log([...byRcp].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${v}\t${k}`).join("\n"));
