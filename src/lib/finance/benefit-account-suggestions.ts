/** Account-context hints only. Never writes a classification or a payment. */
export function benefitAccountSuggestions(
  account: { account_kind: string; account_name: string; bank_name?: string | null } | null | undefined,
  categories: { id: string; code: string }[],
): string[] {
  if (account?.account_kind !== "benefits") return [];
  if (!/coverflex/i.test(`${account.account_name} ${account.bank_name ?? ""}`)) return [];
  return categories.filter((category) => category.code === "PES.FOOD").map((category) => category.id);
}