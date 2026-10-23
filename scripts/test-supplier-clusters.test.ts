import { describe, expect, it } from "vitest";
import { bankPatternKey, buildSupplierClusters, clusterPurchasePairs, normalizeSupplierName } from "../src/lib/finance/supplier-clusters";

const co = (id: string, name: string, nif: string | null = null, bank: string[] = []) => ({ id, name, nif, bankDescriptions: bank });

describe("supplier clusters", () => {
  it("strips accents, punctuation and legal suffixes", () => {
    expect(normalizeSupplierName("Lovable Labs Incorporated")).toBe("lovable labs");
    expect(normalizeSupplierName("Águas, S.A.")).toBe("aguas");
    expect(normalizeSupplierName("Foo Unipessoal Lda")).toBe("foo");
  });
  it("groups the three Lovable names into one cluster", () => {
    const cl = buildSupplierClusters([co("a", "Lovable Labs"), co("b", "Lovable Labs Incorporated"), co("c", "Lovable Lab Incorpareited", "GB509006909"), co("d", "Apple Sales International")]);
    expect(cl).toHaveLength(1);
    expect(cl[0].ids.sort()).toEqual(["a", "b", "c"]);
  });
  it("keeps different Apple companies apart without shared evidence", () => {
    expect(buildSupplierClusters([co("a", "Apple Distribution International Ltd."), co("b", "Apple Sales International")])).toHaveLength(0);
  });
  it("links via bank pattern, ignoring the card prefix", () => {
    expect(bankPatternKey("MDB8022 LOVABLE")).toBe("LOVABLE");
    const cl = buildSupplierClusters([co("a", "Lovable", null, ["MDB8022 LOVABLE"]), co("b", "LVBL Labs", null, ["MDB8022 LOVABLE"])]);
    expect(cl[0]?.edges[0].reason).toBe("bank_pattern");
  });
  it("respects not-duplicate decisions", () => {
    expect(buildSupplierClusters([co("a", "Lovable Labs"), co("b", "Lovable Labs Inc")], [["b", "a"]])).toHaveLength(0);
  });
  it("flags same amount within 3 days, same company only", () => {
    const d = (id: string, date: string, total: number, entityId = "e1") => ({ id, companyId: "x", entityId, number: id, date, total });
    expect(clusterPurchasePairs([d("1", "2026-07-31", 300), d("2", "2026-07-31", 300), d("3", "2026-08-05", 300), d("4", "2026-07-31", 300, "e2")])).toHaveLength(1);
  });
});
