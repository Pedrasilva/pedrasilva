/**
 * Suspected duplicate purchases (admin + finance). Listing is read-only;
 * the only write is a person's explicit decision:
 *   - "duplicate": keep A, void B (status cancelled + reason + link to A), never deleted;
 *   - "not_duplicate": remembered in finance_duplicate_decisions for the pair.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertFinanceAccess(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: hasFinance }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_permission", { _user_id: userId, _key: "finance.dashboard" }),
  ]);
  if (!isAdmin && !hasFinance) throw new Response("Forbidden: finance access required", { status: 403 });
  return !!isAdmin;
}

export type PayState = "paid" | "scheduled" | "open";
export type DupDoc = {
  id: string;
  supplier: string;
  nif: string | null;
  number: string | null;
  date: string | null;
  dueDate: string | null;
  total: number;
  status: string;
  pay: PayState;
  payments: number;
  createdBy: string | null;
  createdAt: string;
  how: "intake" | "manual" | "import";
  filePath: string | null;
};
export type DupGroup = { key: string; kind: "same_number" | "probable"; docs: DupDoc[]; bothPaid: boolean; bothScheduled: boolean };

const ordered = (a: string, b: string) => (a < b ? { item_a: a, item_b: b } : { item_a: b, item_b: a });
const nifKey = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PT/, "") || null;
const days = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);

export const listPurchaseDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ groups: DupGroup[] }> => {
    const { supabase, userId } = context;
    const isAdmin = await assertFinanceAccess(supabase, userId);
    const { normDocNumber } = await import("./intake-duplicates.server");
    const docs: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("financial_documents")
        .select("id, document_number, issue_date, due_date, total_inc_vat, status, payment_status, paid_amount, created_by, created_at, source, file_path, counterparty_supplier_id, counterparty_name_snapshot, companies:counterparty_supplier_id(nome, nif)")
        .eq("doc_type", "supplier_invoice")
        .neq("status", "cancelled")
        .order("id")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      docs.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    const ids = docs.map((d) => d.id);
    const payCount = new Map<string, number>();
    const fromQueue = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const chunk = ids.slice(i, i + 300);
      const [{ data: p, error: e1 }, { data: q, error: e2 }] = await Promise.all([
        supabase.from("financial_document_payments").select("document_id").in("document_id", chunk),
        supabase.from("financial_document_review_queue").select("settled_document_id, created_expense_id").or(`settled_document_id.in.(${chunk.join(",")}),created_expense_id.in.(${chunk.join(",")})`),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      for (const r of p ?? []) payCount.set(r.document_id, (payCount.get(r.document_id) ?? 0) + 1);
      for (const r of q ?? []) for (const k of [r.settled_document_id, r.created_expense_id]) if (k) fromQueue.add(k);
    }
    const names = new Map<string, string>();
    if (isAdmin) {
      const { data: u } = await supabase.rpc("list_users_with_roles");
      for (const r of (u ?? []) as any[]) names.set(r.user_id, r.collaborator_nome || r.email);
    }
    const { data: dec } = await supabase.from("finance_duplicate_decisions").select("item_a, item_b, decision");
    const decided = new Set((dec ?? []).map((d: any) => `${d.item_a}|${d.item_b}`));

    const toDoc = (d: any): DupDoc => {
      const payments = payCount.get(d.id) ?? 0;
      const paid = d.status === "paid" || d.status === "partially_paid" || ["reconciled", "paid_at_source"].includes(d.payment_status) || payments > 0;
      return {
        id: d.id,
        supplier: d.companies?.nome ?? d.counterparty_name_snapshot ?? "—",
        nif: d.companies?.nif ?? null,
        number: d.document_number,
        date: d.issue_date,
        dueDate: d.due_date,
        total: Number(d.total_inc_vat ?? 0),
        status: d.status,
        pay: paid ? "paid" : d.due_date ? "scheduled" : "open",
        payments,
        createdBy: d.created_by ? names.get(d.created_by) ?? null : null,
        createdAt: d.created_at,
        how: d.source === "ocr" || fromQueue.has(d.id) ? "intake" : d.source === "import" ? "import" : "manual",
        filePath: d.file_path,
      };
    };
    const sup = (d: any) => nifKey(d.companies?.nif) ?? d.counterparty_supplier_id ?? null;
    const groups: DupGroup[] = [];
    const inExact = new Set<string>();
    const byNum = new Map<string, any[]>();
    for (const d of docs) {
      const n = normDocNumber(d.document_number);
      const s = sup(d);
      if (!n || !s || !d.issue_date) continue;
      const k = `${s}|${n}|${String(d.issue_date).slice(0, 4)}`;
      byNum.set(k, [...(byNum.get(k) ?? []), d]);
    }
    const finish = (key: string, kind: DupGroup["kind"], list: any[]) => {
      const ds = list.map(toDoc).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      groups.push({ key, kind, docs: ds, bothPaid: ds.filter((x) => x.pay === "paid").length >= 2, bothScheduled: ds.filter((x) => x.pay === "scheduled").length >= 2 });
    };
    for (const [k, list] of byNum) {
      if (list.length < 2) continue;
      const pairIds = list.map((x) => x.id).sort();
      // Skip when every pair in the group was marked "not duplicate".
      let open = false;
      for (let i = 0; i < pairIds.length; i++) for (let j = i + 1; j < pairIds.length; j++) if (!decided.has(`${pairIds[i]}|${pairIds[j]}`)) open = true;
      list.forEach((x) => inExact.add(x.id));
      if (open) finish(`n:${k}`, "same_number", list);
    }
    const bySup = new Map<string, any[]>();
    for (const d of docs) {
      const s = sup(d);
      if (!s || !d.issue_date || inExact.has(d.id)) continue;
      bySup.set(s, [...(bySup.get(s) ?? []), d]);
    }
    for (const list of bySup.values()) {
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (Math.abs(Number(a.total_inc_vat ?? 0) - Number(b.total_inc_vat ?? 0)) > 0.01) continue;
          if (days(a.issue_date, b.issue_date) > 5) continue;
          const o = ordered(a.id, b.id);
          if (decided.has(`${o.item_a}|${o.item_b}`)) continue;
          finish(`p:${o.item_a}|${o.item_b}`, "probable", [a, b]);
        }
    }
    groups.sort((x, y) => Number(y.bothPaid || y.bothScheduled) - Number(x.bothPaid || x.bothScheduled));
    return { groups };
  });

export const resolvePurchaseDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      decision: z.enum(["duplicate", "not_duplicate"]),
      keepId: z.string().uuid(),
      otherIds: z.array(z.string().uuid()).min(1).max(10),
      reason: z.string().trim().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const all = [data.keepId, ...data.otherIds];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const { error } = await supabase
          .from("finance_duplicate_decisions")
          .upsert({ ...ordered(all[i], all[j]), decision: data.decision, decided_by: userId }, { onConflict: "item_a,item_b" });
        if (error) throw new Error(error.message);
      }
    if (data.decision === "not_duplicate") return { ok: true, voided: 0 };
    if (!data.reason) throw new Error("A reason is required to void a duplicate");
    const { error } = await supabase
      .from("financial_documents")
      .update({ status: "cancelled", void_reason: data.reason, voided_duplicate_of: data.keepId, voided_by: userId, voided_at: new Date().toISOString() })
      .in("id", data.otherIds)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
    return { ok: true, voided: data.otherIds.length };
  });
