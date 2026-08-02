import { extractDocument, detectDirection, getOwnCompanyVat } from "./src/lib/finance/doc-intake.server";
const path = process.argv[2]!;
const r = await extractDocument("financial-documents", path);
if (!r.ok) { console.log("ERR", r.error); process.exit(1); }
const own = await getOwnCompanyVat();
const ex = r.extraction;
console.log(JSON.stringify({ seller_name: ex.seller_name, seller_vat: ex.seller_vat, buyer_name: ex.buyer_name, buyer_vat: ex.buyer_vat, footer_legal_text: ex.footer_legal_text, all_vat_numbers: ex.all_vat_numbers, doc_type: ex.doc_type, total: ex.total_amount }, null, 2));
console.log("DIRECTION", JSON.stringify(detectDirection(own, ex)));
