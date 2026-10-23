import { describe, expect, it } from "vitest";
import { draftCheck, statementPeriodCode, type PeriodLite } from "../src/lib/finance/bank-statements";

const p = (o: Partial<PeriodLite>): PeriodLite => ({
  id: "x", bank_account_id: "A", payment_card_id: null, statement_number: "", period_start_date: "2026-07-01",
  period_end_date: "2026-07-31", opening_balance: 0, closing_balance: 0, status: "draft",
  balance_disagreement: false, ai_readings: null, attached_documents: {}, ...o,
});

describe("statement IDs", () => {
  it("account code + month/year of the period end", () => {
    expect(statementPeriodCode("MBCP", "2026-06-30")).toBe("MBCP 06/2026");
  });
  it("card code", () => {
    expect(statementPeriodCode("VISA 1234", "2026-06-15")).toBe("VISA 1234 06/2026");
  });
  it("suffix for a second statement in a month", () => {
    expect(statementPeriodCode("CGD", "2026-07-31", 2)).toBe("CGD 07/2026-2");
  });
});

describe("draft checks", () => {
  const june = p({ id: "jun", period_start_date: "2026-06-01", period_end_date: "2026-06-30", closing_balance: 28984.38, status: "confirmed" });
  it("green when opening equals previous closing and models agree", () => {
    const jul = p({ id: "jul", opening_balance: 28984.38 });
    expect(draftCheck(jul, [june, jul]).passes).toBe(true);
  });
  it("continuity break is red", () => {
    const jul = p({ id: "jul", opening_balance: 28000 });
    const c = draftCheck(jul, [june, jul]);
    expect(c.passes).toBe(false);
    expect(c.continuity?.difference).toBe(-984.38);
  });
  it("model disagreement is red", () => {
    const jul = p({ id: "jul", opening_balance: 28984.38, balance_disagreement: true });
    expect(draftCheck(jul, [june, jul]).passes).toBe(false);
  });
  it("other card's period is not the previous one", () => {
    const card = p({ id: "c", payment_card_id: "K", period_end_date: "2026-06-30", period_start_date: "2026-06-01", closing_balance: 5 });
    const jul = p({ id: "jul", opening_balance: 1 });
    expect(draftCheck(jul, [card, jul]).continuity).toBeNull();
  });
});
