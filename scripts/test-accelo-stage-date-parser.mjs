#!/usr/bin/env node
/**
 * Sanity tests for parseStageDateRange in src/lib/imports/accelo-activity-parser.ts.
 * Run with: node --import tsx scripts/test-accelo-stage-date-parser.mjs
 */
import { parseStageDateRange } from "../src/lib/imports/accelo-activity-parser.ts";

const cases = [
  { input: "01/02/24 to 05/03/24", start: "2024-02-01", end: "2024-03-05", warn: false },
  { input: "2024-02-01 - 2024-03-05", start: "2024-02-01", end: "2024-03-05", warn: false },
  { input: "28/01/26 to 09/03/26", start: "2026-01-28", end: "2026-03-09", warn: false },
  { input: "01.02.2024 - 05.03.2024", start: "2024-02-01", end: "2024-03-05", warn: false },
  // Excel serial pair: 45323 = 2024-02-01, 45356 = 2024-03-05
  { input: "45323 to 45356", start: "2024-02-01", end: "2024-03-05", warn: false },
  // swapped → swap + warn
  { input: "05/03/24 to 01/02/24", start: "2024-02-01", end: "2024-03-05", warn: true },
  // single date → start = end with warning
  { input: "28/01/26", start: "2026-01-28", end: "2026-01-28", warn: true },
  { input: "2025-10-28", start: "2025-10-28", end: "2025-10-28", warn: true },
  { input: "Tue Oct 28 2025 12:00:00 GMT+0000", start: "2025-10-28", end: "2025-10-28", warn: true },
  // unparseable
  { input: "not a date at all", start: null, end: null, warn: true },
  { input: "", start: null, end: null, warn: false },
];

let failed = 0;
for (const c of cases) {
  const r = parseStageDateRange(c.input);
  const ok =
    r.start === c.start &&
    r.end === c.end &&
    Boolean(r.warning) === c.warn;
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} "${c.input}" → start=${r.start} end=${r.end} warn=${r.warning ?? "null"}`);
  if (!ok) {
    failed++;
    console.log(`   expected start=${c.start} end=${c.end} warn=${c.warn}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll parser sanity tests passed.");
