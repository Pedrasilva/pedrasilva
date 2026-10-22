/**
 * Pure financial rollup helpers for the project Insights tab.
 *
 * Extracted from `use-project-insights.ts` so the math can be unit-tested in
 * isolation without spinning up Supabase / React Query. The shapes use
 * `Partial<>` and tolerate missing/null fields so that legacy DB rows do not
 * crash the UI.
 *
 * Financial model (locked):
 *   External services (pm_materials):
 *     cost    = purchase_price * quantity
 *     revenue = sale_price * quantity
 *     profit  = revenue - cost
 *
 *   Expenses (pm_expenses): pass-through, no markup.
 *     cost    = purchase_price
 *     revenue = (rebillable AND invoiced_at set) ? purchase_price : 0
 *     profit  = revenue - cost
 *     A rebillable expense still counts as a full cost until it is marked
 *     invoiced; then it nets to zero. Non-rebillable expenses are always a
 *     straight cost. Revenue from invoiced expenses also feeds `invoiced`.
 *
 *   Total = services + external_services + expenses
 */

export interface FinancialsRow {
  budget: number;
  value: number;
  cost: number;
  profit: number;
  invoiced: number;
}

/** Minimal shape of a row in pm_materials needed for rollups. */
export interface ExternalServiceLike {
  purchase_price?: number | string | null;
  sale_price?: number | string | null;
  quantity?: number | string | null;
}

/** Minimal shape of a row in pm_expenses needed for rollups. */
export interface ProjectExpenseLike {
  purchase_price?: number | string | null;
  rebillable?: boolean | null;
  invoiced_at?: string | null;
  // sale_price is never read — expenses are re-billed at cost
}

/** Coerce any value to a finite number, defaulting to 0. */
export function toNum(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Per-row math for one external service. */
export function externalServiceLine(row: ExternalServiceLike): {
  cost: number;
  revenue: number;
  profit: number;
} {
  // Quantity defaults to 1 only when truly absent; an explicit 0 stays 0
  // so that a zero-quantity row produces zero cost AND zero revenue.
  const qtyRaw = row.quantity;
  const quantity =
    qtyRaw === null || qtyRaw === undefined || qtyRaw === "" ? 1 : toNum(qtyRaw, 1);
  const cost = toNum(row.purchase_price) * quantity;
  const revenue = toNum(row.sale_price) * quantity;
  return { cost, revenue, profit: revenue - cost };
}

/** Per-row math for one expense (cost-only). */
export function projectExpenseLine(row: ProjectExpenseLike): {
  cost: number;
  revenue: number;
  profit: number;
} {
  const cost = toNum(row.purchase_price);
  const invoiced = Boolean(row.rebillable) && row.invoiced_at != null;
  const revenue = invoiced ? cost : 0;
  // Avoid producing -0 (strict-equal asserts treat -0 ≠ 0).
  const profit = revenue - cost || 0;
  return { cost, revenue, profit };
}

/** Aggregate a list of external services into a FinancialsRow. */
export function rollupExternalServices(rows: ExternalServiceLike[]): FinancialsRow {
  let cost = 0;
  let revenue = 0;
  for (const row of rows) {
    const line = externalServiceLine(row);
    cost += line.cost;
    revenue += line.revenue;
  }
  // For external services, `budget` and `value` are both the revenue figure;
  // there is no separate plan vs actual at this stage of the product.
  return {
    budget: revenue,
    value: revenue,
    cost,
    profit: revenue - cost,
    invoiced: 0,
  };
}

/** Aggregate a list of expenses into a FinancialsRow (revenue only from invoiced rebillables). */
export function rollupExpenses(rows: ProjectExpenseLike[]): FinancialsRow {
  let cost = 0;
  let revenue = 0;
  for (const row of rows) {
    const line = projectExpenseLine(row);
    cost += line.cost;
    revenue += line.revenue;
  }
  return {
    budget: revenue,
    value: revenue,
    cost,
    profit: revenue - cost || 0,
    invoiced: revenue,
  };
}

/** Sum any number of FinancialsRows component-wise. */
export function sumFinancialsRows(...rows: FinancialsRow[]): FinancialsRow {
  return rows.reduce<FinancialsRow>(
    (acc, r) => ({
      budget: acc.budget + r.budget,
      value: acc.value + r.value,
      cost: acc.cost + r.cost,
      profit: acc.profit + r.profit,
      invoiced: acc.invoiced + r.invoiced,
    }),
    { budget: 0, value: 0, cost: 0, profit: 0, invoiced: 0 },
  );
}
