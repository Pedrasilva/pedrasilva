/**
 * Quote settings — per-supplier administration markup editor.
 *
 * Enumerates every supplier referenced by the current quote (via
 * quote_stages and quote_external_services), joins them with the
 * quote_supplier_markups table, and lets the user set an admin markup
 * percentage per supplier (0% default). The markup inflates client-billed
 * supplier prices in rollups, the composer, and the payment schedule
 * without touching what we pay the supplier.
 */
import { useMemo, useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import {
  useQuoteSupplierMarkups,
  useUpsertQuoteSupplierMarkup,
} from "@/lib/quotes/use-quote-supplier-markups";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  supplierIdentityKey,
  resolveSupplierMarkupPct,
  type SupplierIdentity,
} from "@/lib/quotes/supplier-markup-lookup";

interface SupplierRow extends SupplierIdentity {
  key: string;
  label: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function QuoteSupplierMarkupEditor({ quoteId }: { quoteId: string }) {
  const stagesQ = useQuoteStages(quoteId);
  const extQ = useQuoteExternalServices(quoteId);
  const markupsQ = useQuoteSupplierMarkups(quoteId);
  const upsert = useUpsertQuoteSupplierMarkup(quoteId);

  const stages = stagesQ.data ?? [];
  const externalServices = extQ.data ?? [];

  // Collect the companies + pm_suppliers we need names for.
  const { companyIds, pmSupplierIds } = useMemo(() => {
    const cIds = new Set<string>();
    const pIds = new Set<string>();
    for (const s of stages as Array<{
      supplier_company_id?: string | null;
      supplier_id?: string | null;
    }>) {
      if (s.supplier_company_id) cIds.add(s.supplier_company_id);
      if (s.supplier_id) pIds.add(s.supplier_id);
    }
    for (const e of externalServices as Array<{
      supplier_company_id?: string | null;
      supplier_id?: string | null;
    }>) {
      if (e.supplier_company_id) cIds.add(e.supplier_company_id);
      if (e.supplier_id) pIds.add(e.supplier_id);
    }
    return {
      companyIds: [...cIds],
      pmSupplierIds: [...pIds],
    };
  }, [stages, externalServices]);

  const namesQ = useQuery({
    queryKey: [
      "quote-supplier-markup-names",
      quoteId,
      companyIds.join(","),
      pmSupplierIds.join(","),
    ],
    enabled: companyIds.length > 0 || pmSupplierIds.length > 0,
    queryFn: async () => {
      const companyMap = new Map<string, string>();
      const pmMap = new Map<string, string>();
      if (companyIds.length > 0) {
        const { data } = await db
          .from("companies")
          .select("id,nome")
          .in("id", companyIds);
        for (const r of (data ?? []) as Array<{ id: string; nome: string }>) {
          if (r?.id && r?.nome) companyMap.set(r.id, r.nome);
        }
      }
      if (pmSupplierIds.length > 0) {
        const { data } = await db
          .from("pm_suppliers")
          .select("id,name")
          .in("id", pmSupplierIds);
        for (const r of (data ?? []) as Array<{ id: string; name: string }>) {
          if (r?.id && r?.name) pmMap.set(r.id, r.name);
        }
      }
      return { companyMap, pmMap };
    },
  });

  const companyMap = namesQ.data?.companyMap ?? new Map<string, string>();
  const pmMap = namesQ.data?.pmMap ?? new Map<string, string>();

  const suppliers: SupplierRow[] = useMemo(() => {
    const map = new Map<string, SupplierRow>();
    const push = (id: SupplierIdentity, label: string) => {
      const key = supplierIdentityKey(id);
      if (!key) return;
      if (map.has(key)) return;
      map.set(key, { key, label, ...id });
    };
    for (const s of stages as Array<{
      supplier_company_id?: string | null;
      supplier_id?: string | null;
      supplier_placeholder?: string | null;
    }>) {
      if (s.supplier_company_id) {
        push(
          { supplier_company_id: s.supplier_company_id },
          companyMap.get(s.supplier_company_id) ?? "—",
        );
      } else if (s.supplier_id) {
        push(
          { supplier_id: s.supplier_id },
          pmMap.get(s.supplier_id) ?? "—",
        );
      } else {
        const ph = (s.supplier_placeholder ?? "").trim();
        if (ph) push({ supplier_label: ph }, ph);
      }
    }
    for (const e of externalServices as Array<{
      supplier_company_id?: string | null;
      supplier_id?: string | null;
      description?: string | null;
    }>) {
      if (e.supplier_company_id) {
        push(
          { supplier_company_id: e.supplier_company_id },
          companyMap.get(e.supplier_company_id) ?? "—",
        );
      } else if (e.supplier_id) {
        push(
          { supplier_id: e.supplier_id },
          pmMap.get(e.supplier_id) ?? "—",
        );
      } else {
        const desc = (e.description ?? "").trim();
        if (desc) push({ supplier_label: desc }, desc);
      }
    }
    return [...map.values()].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  }, [stages, externalServices, companyMap, pmMap]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs">Taxa de administração por fornecedor</Label>
        <p className="text-[11px] text-muted-foreground">
          0% para desactivar
        </p>
      </div>
      {suppliers.length === 0 ? (
        <p className="rounded-md border border-dashed bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          Sem fornecedores associados a este orçamento.
        </p>
      ) : (
        <div className="divide-y rounded-md border bg-background">
          {suppliers.map((s) => (
            <SupplierMarkupRowEditor
              key={s.key}
              row={s}
              quoteId={quoteId}
              currentPct={resolveSupplierMarkupPct(s, markupsQ.data)}
              disabled={upsert.isPending}
              onSave={(pct) =>
                upsert.mutate({
                  quote_id: quoteId,
                  supplier_company_id: s.supplier_company_id ?? null,
                  supplier_id: s.supplier_id ?? null,
                  supplier_label: s.supplier_label ?? null,
                  markup_pct: pct,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierMarkupRowEditor({
  row,
  currentPct,
  disabled,
  onSave,
}: {
  row: SupplierRow;
  quoteId: string;
  currentPct: number;
  disabled: boolean;
  onSave: (pct: number) => void;
}) {
  const [value, setValue] = useState<string>(String(currentPct ?? 0));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when server value changes (e.g. another editor session).
  useEffect(() => {
    setValue(String(currentPct ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPct]);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return;
    if (Math.abs(n - currentPct) < 1e-9) return;
    onSave(Math.round(n * 100) / 100);
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{row.label}</span>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min="0"
          max="100"
          step="0.5"
          className="h-8 w-20 text-right"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => commit(e.target.value), 600);
          }}
          onBlur={(e) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            commit(e.target.value);
          }}
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}
