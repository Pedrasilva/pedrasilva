/** Pure expense arithmetic; fiscal VAT lives only on invoice documents. */
export function expenseClientAmount(cost: number | null, mode: string | null, markup: number | null): number | null {
  if (cost === null || !Number.isFinite(cost)) return null;
  return mode === 'none' ? 0 : Math.round(cost * (mode === 'markup' ? 1 + (markup ?? 0) / 100 : 1) * 100) / 100;
}

export function expenseCost(row: { workflow_version?: number | null; eur_amount?: number | string | null; purchase_price?: number | string | null }): number {
  return row.workflow_version === 2 ? row.eur_amount == null ? NaN : Number(row.eur_amount) : Number(row.purchase_price ?? 0);
}

export function receiptNet(gross: number, billed: number, vat: number): number {
  return billed + vat > 0 ? gross * billed / (billed + vat) : 0;
}