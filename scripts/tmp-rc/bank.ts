import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reprocessQueueItem } from "@/lib/finance/doc-intake.server";
const { data } = await supabaseAdmin.from("financial_document_review_queue").select("id").eq("status","pending_review").eq("intake_route","bank").is("extracted_recipient_vat", null);
console.log("bank items", data!.length);
let i=0; for (const r of data!) { const x = await reprocessQueueItem(r.id); i++; console.log(i, r.id, x.ok ? "ok" : x.error); }
console.log("DONE");
