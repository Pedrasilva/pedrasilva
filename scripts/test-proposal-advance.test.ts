import { describe, it, expect } from "vitest";
import { computeStageFees, generateByStageBilling, applyPaymentDefaults } from "../src/lib/quotes/payment-generators";
import { rolledUpBillableFees } from "../src/lib/quotes/stage-billing";
import type { QuoteStage } from "../src/lib/quotes/types";
const fees = [6000, 46000, 26000, 28000, 3000];
const stages = fees.map((budget, i) => ({
  id: `s${i}`, name: `Stage ${i}`, budget, sale_source: "budget",
  start_date: "2000-01-03", end_date: "2000-06-20", sort_order: i,
  stage_billing_timing: i > 0 && i < 4 ? "split" : "end",
})) as QuoteStage[];
describe("2675 proportional advance", () => {
  const leaf = computeStageFees(stages, [], [], 1, "allocation");
  const total = Object.values(rolledUpBillableFees(stages, leaf)).reduce((s, n) => s + n, 0);
  const items = generateByStageBilling(stages, leaf, {downPaymentPercent: 10, deductDownPaymentFromStages: true});
  it("keeps the agreed stage fees at 109000", () => expect(total).toBe(109000));
  it("invoices 10900 upfront and only 90% of each remaining stage", () => {
    expect(items.map(i => i.amount_value)).toEqual([10900,5400,20700,20700,11700,11700,12600,12600,2700]);
    expect(items.reduce((s, i) => s + i.amount_value, 0)).toBe(109000);
  });
  it("honours VAT exemption when generating invoices", () => {
    const exempt = applyPaymentDefaults(items, {vatRate: 0, defaultTerms: "30 days", firstPaymentTerms: "Immediate"});
    expect(exempt.reduce((s,i) => s + i.amount_value * Number(i.vat_rate) / 100,0)).toBe(0);
  });
});