import { describe, it, expect } from "vitest";
import { benefitAccountSuggestions } from "../src/lib/finance/benefit-account-suggestions";
describe("Coverflex meal allowance suggestions", () => {
  const categories = [{ id: "meal", code: "PES.FOOD" }, { id: "other", code: "DES.MEALS" }];
  it("suggests Staff meal allowance for Coverflex benefits movements", () => {
    expect(benefitAccountSuggestions({ account_kind: "benefits", account_name: "COVERFLEX" }, categories)).toEqual(["meal"]);
  });
  it("does not treat a bank or another benefit as meal cards", () => {
    expect(benefitAccountSuggestions({ account_kind: "bank", account_name: "COVERFLEX" }, categories)).toEqual([]);
    expect(benefitAccountSuggestions({ account_kind: "benefits", account_name: "Other benefit" }, categories)).toEqual([]);
  });
});