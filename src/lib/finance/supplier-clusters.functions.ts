/** Read-only supplier duplicate clusters (admin). Never writes. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildSupplierClusters, clusterPurchasePairs, type ClusterDoc, type ClusterEdge } from "./supplier-clusters";

export type ClusterMember = { id: string; name: string; nif: string | null; byEntity: Record<string, { docs: number; total: number }> };
export type SupplierCluster = {
  key: string;
  confidence: number;
  members: ClusterMember[];
  edges: ClusterEdge[];
  purchasePairs: Array<{ entityId: string; a: ClusterDoc; b: ClusterDoc }>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
async function pageAll(build: (from: number) => any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export const listSupplierClusters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ clusters: SupplierCluster[] }> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });
    const sb = supabase as any;
    const [companies, docs, pays, decisions] = await Promise.all([
      pageAll((f) => sb.from("companies").select("id, nome, nif, is_supplier").eq("is_active", true).order("id").range(f, f + 999)),
      pageAll((f) => sb.from("financial_documents").select("id, entity_id, counterparty_supplier_id, document_number, issue_date, total_inc_vat")
        .eq("doc_type", "supplier_invoice").neq("status", "cancelled").not("counterparty_supplier_id", "is", null).order("id").range(f, f + 999)),
      pageAll((f) => sb.from("financial_document_payments").select("document_id, bank_transactions:bank_transaction_id(description)")
        .not("bank_transaction_id", "is", null).order("id").range(f, f + 999)),
      pageAll((f) => sb.from("company_duplicate_decisions").select("company_a, company_b").order("id").range(f, f + 999)),
    ]);
    const docCompany = new Map<string, string>(docs.map((d) => [d.id, d.counterparty_supplier_id]));
    const descs = new Map<string, string[]>();
    for (const p of pays) {
      const cid = docCompany.get(p.document_id);
      const d = p.bank_transactions?.description;
      if (cid && d) descs.set(cid, [...(descs.get(cid) ?? []), d]);
    }
    const withDocs = new Set(docCompany.values());
    const pool = companies.filter((c) => c.is_supplier || withDocs.has(c.id));
    const clusters = buildSupplierClusters(
      pool.map((c) => ({ id: c.id, name: c.nome, nif: c.nif, bankDescriptions: descs.get(c.id) ?? [] })),
      decisions.map((d) => [d.company_a, d.company_b] as [string, string]),
    );
    const byId = new Map(pool.map((c) => [c.id, c]));
    return {
      clusters: clusters.map((cl) => {
        const set = new Set(cl.ids);
        const cdocs: ClusterDoc[] = docs.filter((d) => set.has(d.counterparty_supplier_id)).map((d) => ({
          id: d.id, companyId: d.counterparty_supplier_id, entityId: d.entity_id, number: d.document_number,
          date: d.issue_date, total: Number(d.total_inc_vat) || 0,
        }));
        const members = cl.ids.map((id) => {
          const byEntity: ClusterMember["byEntity"] = {};
          for (const d of cdocs) if (d.companyId === id) {
            const e = (byEntity[d.entityId] ??= { docs: 0, total: 0 });
            e.docs++; e.total += d.total;
          }
          const c = byId.get(id)!;
          return { id, name: c.nome, nif: c.nif, byEntity };
        }).sort((a, b) => sumDocs(b) - sumDocs(a));
        return {
          key: cl.ids.slice().sort().join(":"),
          confidence: cl.confidence,
          members,
          edges: cl.edges,
          purchasePairs: clusterPurchasePairs(cdocs).map(([a, b]) => ({ entityId: a.entityId, a, b })),
        };
      }),
    };
  });

const sumDocs = (m: ClusterMember) => Object.values(m.byEntity).reduce((s, e) => s + e.docs, 0);
