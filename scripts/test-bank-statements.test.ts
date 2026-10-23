import { describe, expect, it } from "vitest";
import {
  changedFields,
  continuityBreaks,
  findDuplicates,
  findGaps,
  hubComparison,
  type BankDocRow,
} from "../src/lib/finance/bank-statements";

const base = (o: Partial<BankDocRow>): BankDocRow => ({
  id: "x", status: "filed", bank_doc_kind: "account_statement", extracted_bank_name: null,
  matched_bank_account_id: "A", matched_payment_card_id: null, extracted_statement_number: null,
  extracted_period_start: null, extracted_period_end: null, extracted_opening_balance: null,
  extracted_closing_balance: null, extracted_total_debits: null, extracted_total_credits: null,
  extracted_card_due_date: null, extracted_card_amount_to_debit: null, extracted_statement_card_last4: null,
  bank_identity_flag: null, bank_ai_values: {}, bank_field_overrides: {}, statement_period_id: null,
  source_file_url: null, source_bucket: null, original_filename: null, bank_period: null, created_at: "",
  ...o,
});

describe("bank statement registry rules", () => {
  it("printed opening + Hub movements = computed closing; green only when it equals the printed closing", () => {
    expect(hubComparison(1000, 750.5, -249.5)).toMatchObject({ computedClosing: 750.5, difference: 0, matches: true });
    expect(hubComparison(1000, 800, -249.5)).toMatchObject({ computedClosing: 750.5, difference: 49.5, matches: false });
  });

  it("same account + same period is a duplicate", () => {
    const rows = [
      base({ id: "1", extracted_period_start: "2026-10-01", extracted_period_end: "2026-10-31" }),
      base({ id: "2", status: "pending_review", extracted_period_start: "2026-10-01", extracted_period_end: "2026-10-31" }),
      base({ id: "3", extracted_period_start: "2026-09-01", extracted_period_end: "2026-09-30" }),
    ];
    const d = findDuplicates(rows);
    expect(d.get("1")).toEqual(["2"]);
    expect(d.has("3")).toBe(false);
  });

  it("a missing month between two statements is a gap", () => {
    const rows = [
      base({ id: "1", extracted_period_start: "2026-07-01", extracted_period_end: "2026-07-31" }),
      base({ id: "2", extracted_period_start: "2026-10-01", extracted_period_end: "2026-10-31" }),
    ];
    expect(findGaps(rows)).toEqual([{ key: "acc:A", months: ["2026-08", "2026-09"] }]);
  });

  it("opening must equal the previous closing", () => {
    const rows = [
      base({ id: "1", extracted_period_start: "2026-09-01", extracted_period_end: "2026-09-30", extracted_closing_balance: 500 }),
      base({ id: "2", extracted_period_start: "2026-10-01", extracted_period_end: "2026-10-31", extracted_opening_balance: 520 }),
    ];
    expect(continuityBreaks(rows).get("2")).toMatchObject({ previousId: "1", difference: 20 });
    rows[1].extracted_opening_balance = 500;
    expect(continuityBreaks(rows).size).toBe(0);
  });

  it("only changed fields are sent as corrections", () => {
    expect(changedFields({ extracted_opening_balance: 100, extracted_statement_number: "6" },
      { extracted_opening_balance: "100", extracted_statement_number: "7" } as never))
      .toEqual({ extracted_statement_number: "7" });
  });
});
