import i18n from "@/i18n/index";
export function formatMoney(value: number | null | undefined, currency = "EUR"): string {
  if (value == null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(i18n.language, { style: "currency", currency: currency || "EUR", maximumFractionDigits: 2 }).format(value);
}
export function formatEUR(value: number): string {
  return new Intl.NumberFormat(i18n.language, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
