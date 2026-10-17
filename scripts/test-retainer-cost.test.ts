import { test } from "node:test";
import assert from "node:assert/strict";
import { retainerCostRate } from "../src/lib/projects/retainer-cost";

test("missing stored retainer cost uses a positive evidence-based fallback", () => {
  assert.equal(2 * retainerCostRate(null, 35), 70);
});
test("missing stored cost without a fallback cannot count as zero", () => {
  assert.equal(Number.isNaN(retainerCostRate(null)), true);
  assert.equal(Number.isNaN(retainerCostRate(null, 0)), true);
});
test("locked retainer rates stay unchanged when current costs change", () => {
  assert.equal(retainerCostRate("24.5", 50), 24.5);
});