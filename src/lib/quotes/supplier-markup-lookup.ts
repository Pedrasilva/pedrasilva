/**
 * Resolves the per-supplier administration markup for a quote.
 *
 * Suppliers can be identified three ways (in decreasing preference):
 *   1. supplier_company_id → companies.id
 *   2. supplier_id         → pm_suppliers.id
 *   3. supplier_label      → free-text placeholder (case-insensitive)
 *
 * A row in quote_supplier_markups matches on the first non-null identity;
 * anything not covered defaults to 0%.
 */

export interface SupplierMarkupRow {
  supplier_company_id: string | null;
  supplier_id: string | null;
  supplier_label: string | null;
  markup_pct: number | string;
}

export interface SupplierIdentity {
  supplier_company_id?: string | null;
  supplier_id?: string | null;
  supplier_label?: string | null;
}

export function supplierIdentityKey(id: SupplierIdentity): string {
  if (id.supplier_company_id) return `co:${id.supplier_company_id}`;
  if (id.supplier_id) return `pm:${id.supplier_id}`;
  const label = (id.supplier_label ?? "").trim().toLowerCase();
  return label ? `lb:${label}` : "";
}

export function resolveSupplierMarkupPct(
  id: SupplierIdentity,
  markups: SupplierMarkupRow[] | null | undefined,
): number {
  if (!markups?.length) return 0;
  if (id.supplier_company_id) {
    const m = markups.find((r) => r.supplier_company_id === id.supplier_company_id);
    if (m) return Number(m.markup_pct) || 0;
  }
  if (id.supplier_id) {
    const m = markups.find(
      (r) => r.supplier_id === id.supplier_id && !r.supplier_company_id,
    );
    if (m) return Number(m.markup_pct) || 0;
  }
  const label = (id.supplier_label ?? "").trim().toLowerCase();
  if (label) {
    const m = markups.find(
      (r) =>
        !r.supplier_company_id &&
        !r.supplier_id &&
        (r.supplier_label ?? "").trim().toLowerCase() === label,
    );
    if (m) return Number(m.markup_pct) || 0;
  }
  return 0;
}

/** Multiply by (1 + pct/100). */
export function applyMarkup(amount: number, pct: number): number {
  return amount * (1 + (Number(pct) || 0) / 100);
}
