import i18n from "@/i18n/index";

/** Display-only formatters; payroll inputs, calculations and documents stay independent. */
export function fmtEUR(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(i18n.language, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function fmtPct(value: number): string {
  return new Intl.NumberFormat(i18n.language, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value);
}

export function fmtNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function fmtDate(value: string | null | undefined): string {
  return value ? new Intl.DateTimeFormat(i18n.language).format(new Date(value.length === 10 ? `${value}T00:00:00` : value)) : "—";
}