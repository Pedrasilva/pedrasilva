import { test } from "node:test";
import assert from "node:assert/strict";
import { pursuitChoices, canEditPursuit } from "../src/lib/projects/pursuit-choices";

test("open unflagged deals without caller hours are excluded", () => {
  assert.deepEqual(pursuitChoices([{ stage: "proposal", can_log_hours: false }]), []);
});
test("flagged or previously logged open deals remain available", () => {
  assert.equal(pursuitChoices([{ stage: "proposal", can_log_hours: true }]).length, 1);
});
test("won deals without active projects precede open deals", () => {
  assert.deepEqual(pursuitChoices([
    { stage: "lead", can_log_hours: true },
    { stage: "won", can_log_hours: true },
  ]).map((l) => l.stage), ["won", "lead"]);
});
test("won deals excluded by directory eligibility do not appear", () => {
  assert.equal(pursuitChoices([{ stage: "won", can_log_hours: false }]).length, 0);
});
test("won rows accept new hours", () => {
  assert.equal(canEditPursuit({ stage: "won", can_log_hours: true }), true);
});
test("lost rows remain read-only even with prior hours", () => {
  assert.equal(canEditPursuit({ stage: "lost", can_log_hours: true }), false);
});