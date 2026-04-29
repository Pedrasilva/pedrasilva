/**
 * Returns a map of supplierId → most-recently-used classification_id.
 *
 * Sources (most recent wins):
 *   1. financial_documents.classification_id (header) where counterparty_supplier_id matches
 *   2. bank_transaction_classifications.classification_id where supplier_id matches
 *
 * Read-only suggestion only — non-blocking, user can override.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSupplierDefaultClassifications() {
  return useQuery({
    queryKey: ["finance", "supplier-default-classifications"],
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const map = new Map<string, { id: string; ts: number }>();

      // 1. From financial documents (header classification)
      const { data: docs } = await supabase
        .from("financial_documents")
        .select("counterparty_supplier_id, classification_id, issue_date, updated_at")
        .not("counterparty_supplier_id", "is", null)
        .not("classification_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      for (const d of docs ?? []) {
        const sid = (d as { counterparty_supplier_id: string | null }).counterparty_supplier_id;
        const cid = (d as { classification_id: string | null }).classification_id;
        if (!sid || !cid) continue;
        const ts = new Date((d as { updated_at: string | null }).updated_at ?? 0).getTime();
        const cur = map.get(sid);
        if (!cur || ts > cur.ts) map.set(sid, { id: cid, ts });
      }

      // 2. From bank transaction classifications (only fill gaps)
      const { data: btc } = await supabase
        .from("bank_transaction_classifications")
        .select("supplier_id, classification_id, updated_at")
        .not("supplier_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      for (const r of btc ?? []) {
        const sid = (r as { supplier_id: string | null }).supplier_id;
        const cid = (r as { classification_id: string | null }).classification_id;
        if (!sid || !cid) continue;
        const ts = new Date((r as { updated_at: string | null }).updated_at ?? 0).getTime();
        const cur = map.get(sid);
        if (!cur || ts > cur.ts) map.set(sid, { id: cid, ts });
      }

      const out: Record<string, string> = {};
      for (const [sid, v] of map.entries()) out[sid] = v.id;
      return out;
    },
  });
}
