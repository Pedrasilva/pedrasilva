import { describe, it, expect } from "vitest";
import { learnedClassificationIds, rankForBrowser } from "../src/lib/finance/classification-rank";

const cats = [
  { id: "a", code: "A.01", name_pt: "Alimentação", name_en: "Meals" },
  { id: "b", code: "B.02", name_pt: "Deslocações", name_en: "Travel" },
  { id: "c", code: "C.03", name_pt: "Software", name_en: "Software" },
];

describe("classification ranking", () => {
  it("learned rule matching the movement description ranks first", () => {
    const ids = learnedClassificationIds("MDB8022 UBER * EAT", [
      { match_type: "contains", pattern: "uber * eat", case_sensitive: false, classification_id: "a", priority: 1, active: true },
      { match_type: "contains", pattern: "lovable", case_sensitive: false, classification_id: "c", priority: 0, active: true },
    ]);
    expect(ids).toEqual(["a"]);
    expect(rankForBrowser(cats, "", false, ["b"]).map((c) => c.id)).toEqual(["b", "a", "c"]);
  });
  it("search matches code, name and Portuguese name without accents", () => {
    expect(rankForBrowser(cats, "B.02", false).map((c) => c.id)).toEqual(["b"]);
    expect(rankForBrowser(cats, "travel", true).map((c) => c.id)).toEqual(["b"]);
    expect(rankForBrowser(cats, "alimentacao", false).map((c) => c.id)).toEqual(["a"]);
  });
});
