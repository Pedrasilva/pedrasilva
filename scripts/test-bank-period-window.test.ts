import { describe, it, expect } from "vitest";
import { canLockPeriod } from "../src/components/finance/bank-period-window";

describe("statement period lock", () => {
  it("blocks lock while movements are unmatched", () => {
    expect(canLockPeriod({ unmatched_count: 1, matched_difference: 0, locked_at: null })).toBe(false);
  });
  it("blocks lock when matched difference is not zero", () => {
    expect(canLockPeriod({ unmatched_count: 0, matched_difference: 0.02, locked_at: null })).toBe(false);
  });
  it("allows lock when all resolved and difference is zero", () => {
    expect(canLockPeriod({ unmatched_count: 0, matched_difference: 0, locked_at: null })).toBe(true);
  });
});
