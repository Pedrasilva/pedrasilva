import { test } from "node:test";
import assert from "node:assert/strict";
import { retainerCostRate, retainerCostAmount } from "../src/lib/projects/retainer-cost";

test("missing stored retainer cost is incomplete, never estimated", () => {
  assert.equal(Number.isNaN(retainerCostAmount(2, null)), true);
});
test("missing stored cost without a fallback cannot count as zero", () => {
  assert.equal(Number.isNaN(retainerCostRate(null)), true);
  for (const invalid of [0, -1, "", "invalid", undefined]) {
    assert.equal(Number.isNaN(retainerCostRate(invalid)), true);
  }
});
test("locked retainer rates stay unchanged when current costs change", () => {
  assert.equal(retainerCostRate("24.5"), 24.5);
});
test("one missing activity suppresses the total even alongside priced hours", () => {
  assert.equal(Number.isNaN(retainerCostAmount(3, 24.5) + retainerCostAmount(2, null)), true);
});
test("zero logged hours do not require a cost snapshot", () => {
  assert.equal(retainerCostAmount(0, null), 0);
});