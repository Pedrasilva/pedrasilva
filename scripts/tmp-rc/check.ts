import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getOwnCompanyVat } from "@/lib/finance/doc-intake.server";
import { recipientCheck, loadOtherEntities, otherEntityColumns, entityNifKey } from "@/lib/finance/other-entities.server";
const APPLY = process.argv[2] === "apply";
const own = await getOwnCompanyVat(); const entities = await loadOtherEntities();
const { data } = await supabaseAdmin.from("financial_document_review_queue")
  .select("id, extracted_seller_vat, extracted_seller_name, original_filename, intake_type, intake_type_source, intake_route, direction, extracted_buyer_vat, extracted_buyer_name, raw_extraction")
  .eq("status","pending_review").limit(2000);
const by = new Map<string,{name:string,n:number}>(); let noRec=0, other=0; const byRoute:Record<string,number>={};
for (const r of data!) {
  const raw:any = r.raw_extraction ?? {};
  const vat = r.extracted_buyer_vat ?? raw.recipient_vat ?? raw.buyer_vat ?? raw._models?.claude?.recipient_vat ?? raw._models?.claude?.buyer_vat ?? null;
  const name = r.extracted_buyer_name ?? raw.recipient_name ?? raw.buyer_name ?? raw._models?.claude?.buyer_name ?? null;
  if (!vat) { noRec++; byRoute[r.intake_route??"null"]=(byRoute[r.intake_route??"null"]??0)+1; continue; }
  const res = recipientCheck({ own, name, vat, sellerVat: r.extracted_seller_vat ?? raw.seller_vat, sellerName: r.extracted_seller_name ?? raw.seller_name, direction: r.direction ?? "received", type: r.intake_type, forcedType: r.intake_type_source==="manual" ? r.intake_type : null, verify:false, entities });
  if (!res.other) continue;
  other++; const key=entityNifKey(vat)!; const e=by.get(key)??{name,n:0}; e.n++; by.set(key,e); if (!["513789898"].includes(key)) console.log("  ",key,r.intake_type,r.intake_route,r.extracted_seller_name ?? raw.seller_name);
  if (APPLY) {
    const cols = otherEntityColumns(res);
    const { error } = await supabaseAdmin.from("financial_document_review_queue").update({ ...cols, extracted_recipient_vat: vat, extracted_recipient_name: name } as any).eq("id", r.id);
    if (error) console.log("ERR", r.id, error.message);
  }
}
console.log({ pending: data!.length, other, noRec, byRoute });
console.log([...by.entries()].sort((a,b)=>b[1].n-a[1].n).map(([k,v])=>`${v.n}\t${k}\t${v.name}`).join("\n"));
