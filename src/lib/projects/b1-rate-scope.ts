/** Only server-verified global capability authorizes context-free B1 rates. */
export function b1RateScope(projectId: string | undefined, globalAllowed: boolean,
  areas?: { budget_cost: boolean; financials: boolean }) {
  if (!projectId) return { budgetAllowed: globalAllowed, saleAllowed: globalAllowed };
  return { budgetAllowed: areas?.budget_cost === true, saleAllowed: areas?.financials === true };
}