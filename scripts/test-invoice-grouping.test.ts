import { describe, expect, it } from "vitest";
import { groupInvoices } from "@/lib/quotes/invoice-grouping";

const T = "30 (trinta) dias de calendário";
const p2675 = [
  { id: "adj", expected_invoice_date: "2026-10-17", payment_terms: "Pronto pagamento", amount: 11170 },
  { id: "a", expected_invoice_date: "2026-11-06", payment_terms: T, amount: 6700 },
  { id: "b", expected_invoice_date: "2026-11-09", payment_terms: T, amount: 23000 },
  { id: "c", expected_invoice_date: "2026-12-20", payment_terms: T, amount: 23000 },
  { id: "d", expected_invoice_date: "2026-12-21", payment_terms: T, amount: 11500 },
  { id: "e", expected_invoice_date: "2027-01-17", payment_terms: T, amount: 11500 },
  { id: "f", expected_invoice_date: "2027-01-18", payment_terms: T, amount: 16500 },
  { id: "g", expected_invoice_date: "2027-03-07", payment_terms: T, amount: 16500 },
  { id: "h", expected_invoice_date: "2027-04-11", payment_terms: T, amount: 3000 },
];

describe("invoice grouping", () => {
  it("2675: 9 invoices become 6 dated on the latest milestone", () => {
    const g = groupInvoices(p2675, 7);
    expect(g).toHaveLength(6);
    expect(g.map((x) => x.date)).toEqual(["2026-10-17", "2026-11-09", "2026-12-21", "2027-01-18", "2027-03-07", "2027-04-11"]);
    const total = g.flatMap((x) => x.ids).reduce((s, id) => s + p2675.find((p) => p.id === id)!.amount, 0);
    expect(total).toBe(122870);
  });
  it("window counts from the first invoice and does not chain", () => {
    const g = groupInvoices([
      { id: "1", expected_invoice_date: "2026-01-01" },
      { id: "2", expected_invoice_date: "2026-01-06" },
      { id: "3", expected_invoice_date: "2026-01-11" },
    ], 7);
    expect(g.map((x) => x.ids)).toEqual([["1", "2"], ["3"]]);
  });
  it("different payment terms and down payments never group", () => {
    const g = groupInvoices([
      { id: "1", expected_invoice_date: "2026-01-01", payment_terms: "30 dias" },
      { id: "2", expected_invoice_date: "2026-01-02", payment_terms: "60 dias" },
      { id: "3", expected_invoice_date: "2026-01-02", payment_terms: "Pronto pagamento" },
    ]);
    expect(g).toHaveLength(3);
  });
  it("issued invoices stay on their own", () => {
    const g = groupInvoices([
      { id: "1", expected_invoice_date: "2026-01-01", billing_status: "issued" },
      { id: "2", expected_invoice_date: "2026-01-02" },
    ]);
    expect(g).toHaveLength(2);
  });
});

describe("2675 copy and conversion dates", () => {
  const T = "30 (trinta) dias de calendário";
  const rows = [["a","2026-10-17","Pronto pagamento",11170],["b","2026-11-06",T,6700],["c","2026-11-09",T,23000],["d","2026-12-20",T,23000],["e","2026-12-21",T,11500],["f","2027-01-17",T,11500],["g","2027-01-18",T,16500],["h","2027-03-07",T,16500],["i","2027-04-11",T,3000]] as const;
  const items = rows.map(([id, d, p, amount]) => ({ id, expected_invoice_date: d, payment_terms: p, vat_rate: 23, amount }));
  it("9 → 6 invoices, same 122,870 € total", () => {
    const g = groupInvoices(items, 7);
    expect(g.length).toBe(6);
    expect(g.map((x) => x.date)).toEqual(["2026-10-17","2026-11-09","2026-12-21","2027-01-18","2027-03-07","2027-04-11"]);
    const byId = new Map(items.map((i) => [i.id, i.amount]));
    expect(g.flatMap((x) => x.ids).reduce((s, id) => s + byId.get(id)!, 0)).toBe(122870);
  });
  it("relative weeks group, real dates after a Christmas closure can split", () => {
    const rel = [{ id: "x", expected_invoice_date: "2000-03-06", payment_terms: T, vat_rate: 23 }, { id: "y", expected_invoice_date: "2000-03-10", payment_terms: T, vat_rate: 23 }];
    expect(groupInvoices(rel, 7).length).toBe(1);
    const real = [{ ...rel[0], expected_invoice_date: "2026-12-18" }, { ...rel[1], expected_invoice_date: "2027-01-04" }];
    expect(groupInvoices(real, 7).length).toBe(2);
  });
});
