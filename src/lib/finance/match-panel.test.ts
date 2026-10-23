import { describe, it, expect } from "vitest";
import { allocateSplit, dedupeSuggestions } from "./match-panel";
import type { Suggestion } from "./reconcile-suggestions";

describe("allocateSplit", () => {
  it("pays two documents that add up to the movement and leaves no remainder", () => {
    const r = allocateSplit(100, [{ id: "a", outstanding: 60 }, { id: "b", outstanding: 40 }]);
    expect(r.allocations).toEqual([{ id: "a", amount: 60 }, { id: "b", amount: 40 }]);
    expect(r.remainder).toBe(0);
  });
  it("never allocates more than is open on the movement", () => {
    const r = allocateSplit(100, [{ id: "a", outstanding: 80 }, { id: "b", outstanding: 50 }]);
    expect(r.allocations).toEqual([{ id: "a", amount: 80 }, { id: "b", amount: 20 }]);
    expect(r.total).toBe(100);
    expect(r.remainder).toBe(-30);
  });
  it("shows the remainder when the selection is short", () => {
    expect(allocateSplit(23.49, [{ id: "a", outstanding: 11.99 }]).remainder).toBe(11.5);
  });
});

describe("dedupeSuggestions", () => {
  const s = (ref: string, kind: Suggestion["kind"] = "entrada"): Suggestion => ({
    kind, ref_id: ref, label: "678182247840", counterparty: "Apple Distribution International Ltd.", doc_date: "2026-08-28",
    amount: 23.49, outstanding: 23.49, confidence: 80, reasons: [], suggested_amount: 23.49, tx_open: 23.49,
  });
  it("keeps one copy of the same Entrada document", () => {
    expect(dedupeSuggestions([s("1"), s("2")]).map((x) => x.ref_id)).toEqual(["1"]);
  });
  it("keeps distinct confirmed documents", () => {
    expect(dedupeSuggestions([s("1", "purchase"), s("2", "purchase")])).toHaveLength(2);
  });
});
