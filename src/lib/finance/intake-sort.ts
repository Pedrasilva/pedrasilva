/** Sort options for the finance inbox list; remembered per tab for each user. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const INBOX_SORTS = ["doc_desc", "doc_asc", "arrived_desc", "arrived_asc", "name_asc", "name_desc", "amount_desc", "amount_asc"] as const;
export type InboxSort = (typeof INBOX_SORTS)[number];

type Sortable = {
  id: string; created_at?: string | null; extracted_date?: string | null; extracted_amount?: number | string | null;
  extracted_seller_name?: string | null; extracted_supplier_name?: string | null; original_filename?: string | null;
};
const nameOf = (r: Sortable) => (r.extracted_seller_name ?? r.extracted_supplier_name ?? r.original_filename ?? "").trim();
const num = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Pure, non-mutating sort. Items without a date / amount / name always go last. */
export function sortInbox<T extends Sortable>(rows: T[], key: InboxSort): T[] {
  const dir = key.endsWith("_desc") ? -1 : 1;
  const val = (r: T): string | number | null =>
    key.startsWith("doc") ? (r.extracted_date || null)
    : key.startsWith("arrived") ? (r.created_at || null)
    : key.startsWith("amount") ? num(r.extracted_amount)
    : (nameOf(r) || null);
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt", { sensitivity: "base" });
    return c * dir;
  });
}

const storeKey = (uid: string) => `finance.intakeSort.${uid}`;

export function useInboxSorts(): [Record<string, InboxSort>, (v: Record<string, InboxSort>) => void] {
  const [uid, setUid] = useState<string | null>(null);
  const [sorts, setSortsState] = useState<Record<string, InboxSort>>({});
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id ?? null;
      setUid(id);
      if (!id) return;
      try { setSortsState(JSON.parse(localStorage.getItem(storeKey(id)) ?? "{}")); } catch { /* ignore */ }
    });
  }, []);
  const set = (v: Record<string, InboxSort>) => {
    setSortsState(v);
    if (uid) localStorage.setItem(storeKey(uid), JSON.stringify(v));
  };
  return [sorts, set];
}
