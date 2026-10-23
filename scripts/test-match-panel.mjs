// Match panel rules: split-payment allocation and Entrada copy de-duplication.
import assert from "node:assert/strict";
import { allocateSplit, dedupeSuggestions } from "../src/lib/finance/match-panel.ts";

let r = allocateSplit(100, [{ id: "a", outstanding: 60 }, { id: "b", outstanding: 40 }]);
assert.deepEqual(r.allocations, [{ id: "a", amount: 60 }, { id: "b", amount: 40 }]);
assert.equal(r.remainder, 0);

r = allocateSplit(100, [{ id: "a", outstanding: 80 }, { id: "b", outstanding: 50 }]);
assert.deepEqual(r.allocations, [{ id: "a", amount: 80 }, { id: "b", amount: 20 }], "never more than open on the movement");
assert.equal(r.total, 100);
assert.equal(r.remainder, -30);

assert.equal(allocateSplit(23.49, [{ id: "a", outstanding: 11.99 }]).remainder, 11.5);

const s = (ref, kind = "entrada") => ({ kind, ref_id: ref, label: "678182247840", counterparty: "Apple Distribution International Ltd.",
  doc_date: "2026-08-28", amount: 23.49, outstanding: 23.49, confidence: 80, reasons: [], suggested_amount: 23.49, tx_open: 23.49 });
assert.deepEqual(dedupeSuggestions([s("1"), s("2")]).map((x) => x.ref_id), ["1"], "one copy of the same Entrada document");
assert.equal(dedupeSuggestions([s("1", "purchase"), s("2", "purchase")]).length, 2);
console.log("match panel: 7 checks passed");
