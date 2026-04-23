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
 *   Expenses (pm_expenses): cost-only.
 *     cost    = purchase_price
 *     revenue = 0    // ALWAYS, regardless of `rebillable`
 *     profit  = -cost
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
  // intentionally NOT reading sale_price — expenses never produce revenue
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
  return { cost, revenue: 0, profit: -cost };
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

/** Aggregate a list of expenses into a FinancialsRow (always cost-only). */
export function rollupExpenses(rows: ProjectExpenseLike[]): FinancialsRow {
  let cost = 0;
  for (const row of rows) {
    cost += projectExpenseLine(row).cost;
  }
  return {
    budget: 0,
    value: 0,
    cost,
    profit: -cost,
    invoiced: 0,
  };
}

/** Sum any number of FinancialsRows component-wise. */
export function sumFinancialsRows(...rows: FinancialsRow[]): FinancialsRow {
  return rows.reduce<FinancialsRow>(
    (acc, r) => ({
      budget: acc.budget + toNum(r.budget),
      value: acc.value + toNum(r.value),
      cost: acc.cost + toNum(r.cost),
      profit: acc.profit + toNum(r.profit),
      invoiced: acc.invoiced + toNum(r.invoiced),
    }),
    { budget: 0, value: 0, cost: 0, profit: 0, invoiced: 0 },
  );
}
