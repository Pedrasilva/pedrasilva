/**
 * Mirrors the database rule in pm_invoice_regroup (used for previews/tests only;
 * the database is the source of truth). Planned inflows with the same payment
 * terms and VAT join when they fall within `days` calendar days of the FIRST
 * invoice in the group; "Pronto pagamento" never groups. Amounts never change.
 */
export type GroupableItem = {
  id: string;
  expected_invoice_date: string | null;
  original_invoice_date?: string | null;
  payment_terms?: string | null;
  vat_rate?: number | null;
  billing_status?: string | null;
  direction?: string | null;
  amount?: number;
};

const DAY = 86400000;
const toMs = (d: string) => Date.parse(d.slice(0, 10) + "T00:00:00Z");

export function isGroupable(i: GroupableItem): boolean {
  return (i.direction ?? "inflow") === "inflow" && (i.billing_status ?? "planned") === "planned"
    && !!i.expected_invoice_date && !/^\s*pronto/i.test(i.payment_terms ?? "");
}

/** Returns groups of ids with their invoice date (latest in the group). */
export function groupInvoices(items: GroupableItem[], days = 7): Array<{ ids: string[]; date: string }> {
  const base = (i: GroupableItem) => (i.original_invoice_date ?? i.expected_invoice_date) as string;
  const key = (i: GroupableItem) => `${i.payment_terms ?? ""}|${i.vat_rate ?? ""}`;
  const eligible = items.filter(isGroupable).sort((a, b) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : base(a) < base(b) ? -1 : base(a) > base(b) ? 1 : 0);
  const out: Array<{ ids: string[]; date: string }> = [];
  let cur: { k: string; start: number; ids: string[]; date: string } | null = null;
  for (const i of eligible) {
    const b = base(i);
    if (!cur || cur.k !== key(i) || toMs(b) > cur.start + days * DAY) {
      if (cur) out.push({ ids: cur.ids, date: cur.date });
      cur = { k: key(i), start: toMs(b), ids: [], date: b };
    }
    cur.ids.push(i.id);
    if (b > cur.date) cur.date = b;
  }
  if (cur) out.push({ ids: cur.ids, date: cur.date });
  for (const i of items) if (!isGroupable(i)) out.push({ ids: [i.id], date: i.expected_invoice_date ?? "" });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
