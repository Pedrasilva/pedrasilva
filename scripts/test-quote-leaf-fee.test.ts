import {describe,it,expect} from "vitest";
import {quoteLeafFee} from "../src/lib/quotes/financial-rollups";
import type {QuoteAllocationWithResource} from "../src/lib/quotes/use-quote-allocations";
const allocation={start_date:"2026-10-19",end_date:"2026-10-21",hours_per_day:4,sale_rate_snapshot:30,cost_rate_snapshot:20} as QuoteAllocationWithResource;
describe("Gantt leaf fees",()=>{
  it("uses shortened allocation effort: 3 days x 4 hours x 30",()=>expect(quoteLeafFee({budget:900},[allocation])).toBe(360));
  it("inherits the quote budget source",()=>expect(quoteLeafFee({budget:900},[allocation],"budget")).toBe(900));
  it("preserves an allocation override over the quote budget source",()=>expect(quoteLeafFee({budget:900,sale_source:"allocation"},[allocation],"budget")).toBe(360));
  it("does not resurrect a stale budget for an unallocated allocation-source leaf",()=>expect(quoteLeafFee({budget:900},[])).toBe(0));
  it("applies the sale multiplier",()=>expect(quoteLeafFee({budget:900},[allocation],"allocation",1.5)).toBe(540));
});