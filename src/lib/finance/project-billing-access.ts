/** Project reads never imply fiscal mutation rights. */
export function canMutateProjectBilling(financeModule: boolean, documentEdit: boolean, legacyFinance: boolean) {
  return financeModule && (documentEdit || legacyFinance);
}