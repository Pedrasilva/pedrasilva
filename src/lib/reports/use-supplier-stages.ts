import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveSupplierMarkupPct, supplierIdentityKey, type SupplierMarkupRow } from "@/lib/quotes/supplier-markup-lookup";
import { fetchAll } from "./use-hours-logged";
import type { CostItem, SupplierStageInfo } from "./budget-consumption";

type QS = {
  is_self: boolean | null;
  quote_id: string;
  supplier_id: string | null;
  supplier_company_id: string | null;
  supplier_placeholder: string | null;
  markup_pct: number | null;
};

/**
 * Supplier stages (source quote stage is_self = false) with their markup,
 * plus every project purchase/expense tagged with its supplier identity.
 */
export function useSupplierStages() {
  return useQuery({
    queryKey: ["report-supplier-stages"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [stages, markups, mats, exps] = await Promise.all([
        fetchAll<{ id: string; project_id: string; source_quote_stage_id: string }>((a, b) =>
          supabase
            .from("pm_stages")
            .select("id, project_id, source_quote_stage_id")
            .not("source_quote_stage_id", "is", null)
            .order("id")
            .range(a, b) as never,
        ),
        fetchAll<SupplierMarkupRow & { quote_id: string }>((a, b) =>
          supabase.from("quote_supplier_markups").select("quote_id, supplier_company_id, supplier_id, supplier_label, markup_pct").order("id").range(a, b) as never,
        ),
        fetchAll<{ project_id: string | null; purchase_price: number | null; quantity: number | null; supplier_id: string | null; supplier_company_id: string | null; supplier_name: string | null }>((a, b) =>
          supabase.from("pm_materials").select("project_id, purchase_price, quantity, supplier_id, supplier_company_id, supplier_name").order("id").range(a, b) as never,
        ),
        fetchAll<{ project_id: string | null; purchase_price: number | null; supplier_id: string | null; supplier_company_id: string | null; vendor: string | null }>((a, b) =>
          supabase.from("pm_expenses").select("project_id, purchase_price, supplier_id, supplier_company_id, vendor").order("id").range(a, b) as never,
        ),
      ]);
      const qsIds = [...new Set(stages.map((s) => s.source_quote_stage_id))];
      const qsById = new Map<string, QS>();
      for (let i = 0; i < qsIds.length; i += 200) {
        const { data, error } = await supabase
          .from("quote_stages")
          .select("id, is_self, quote_id, supplier_id, supplier_company_id, supplier_placeholder, markup_pct")
          .in("id", qsIds.slice(i, i + 200));
        if (error) throw error;
        for (const r of (data ?? []) as unknown as (QS & { id: string })[]) qsById.set(r.id, r);
      }
      const markupsByQuote = new Map<string, SupplierMarkupRow[]>();
      for (const m of markups) markupsByQuote.set(m.quote_id, [...(markupsByQuote.get(m.quote_id) ?? []), m]);
      const supplier = new Map<string, SupplierStageInfo>();
      const keysByProject = new Map<string, Set<string>>();
      for (const s of stages) {
        const q = qsById.get(s.source_quote_stage_id);
        if (!q || q.is_self !== false) continue;
        const id = { supplier_company_id: q.supplier_company_id, supplier_id: q.supplier_id, supplier_label: q.supplier_placeholder };
        const resolved = resolveSupplierMarkupPct(id, markupsByQuote.get(q.quote_id));
        const key = supplierIdentityKey(id);
        supplier.set(s.id, { markupPct: resolved || Number(q.markup_pct) || 0, supplierKey: key });
        if (key) {
          const set = keysByProject.get(s.project_id) ?? new Set<string>();
          set.add(key);
          keysByProject.set(s.project_id, set);
        }
      }
      const items: CostItem[] = [
        ...mats.map((m) => ({
          project_id: m.project_id,
          amount: Number(m.purchase_price ?? 0) * (m.quantity == null ? 1 : Number(m.quantity)),
          supplierKey: supplierIdentityKey({ supplier_company_id: m.supplier_company_id, supplier_id: m.supplier_id, supplier_label: m.supplier_name }),
        })),
        ...exps.map((x) => ({
          project_id: x.project_id,
          amount: Number(x.purchase_price ?? 0),
          supplierKey: supplierIdentityKey({ supplier_company_id: x.supplier_company_id, supplier_id: x.supplier_id, supplier_label: x.vendor }),
        })),
      ];
      return { supplier, keysByProject, items };
    },
  });
}
