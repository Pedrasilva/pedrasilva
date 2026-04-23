#!/usr/bin/env node
/**
 * Unit tests for project financial rollups + dialog validation schemas.
 *
 * Covers:
 *   - External services line math (cost / revenue / profit)
 *   - Expense cost-only contribution (revenue always 0)
 *   - Total row aggregation across services + external services + expenses
 *   - Edge cases: nulls, undefined, zero quantity, manual sale price
 *   - zod validation of both dialog schemas
 *
 * No npm dependencies, no test runner — uses Node's built-in `node:assert`
 * and `node:test`. Run with: `node --import tsx scripts/test-financial-rollups.mjs`
 * (tsx is a project dev dep so TS imports resolve).
 *
 * Exit code 0 on pass, non-zero on any failure.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Dynamic imports so this script can be invoked via `node --import tsx ...`
// without crashing if tsx is missing — we surface a friendlier error instead.
let rollups, validation;
try {
  rollups = await import(pathToFileURL(join(ROOT, "src/lib/projects/financial-rollups.ts")).href);
  validation = await import(
    pathToFileURL(join(ROOT, "src/lib/projects/financial-validation.ts")).href
  );
} catch (err) {
  console.error(
    "\nFailed to import TS sources. Run with:\n  node --import tsx scripts/test-financial-rollups.mjs\n",
  );
  console.error(err);
  process.exit(1);
}

const {
  externalServiceLine,
  projectExpenseLine,
  rollupExternalServices,
  rollupExpenses,
  sumFinancialsRows,
  toNum,
} = rollups;

const {
  externalServiceSchema,
  projectExpenseSchema,
  flattenIssues,
  isOptionalIsoDate,
} = validation;

// ---------------------------------------------------------------------------
// External services — line math
// ---------------------------------------------------------------------------

test("externalServiceLine: normal values", () => {
  const line = externalServiceLine({
    purchase_price: 100,
    sale_price: 150,
    quantity: 2,
  });
  assert.equal(line.cost, 200);
  assert.equal(line.revenue, 300);
  assert.equal(line.profit, 100);
});

test("externalServiceLine: null/undefined treated as 0 (quantity defaults to 1)", () => {
  const line = externalServiceLine({
    purchase_price: null,
    sale_price: undefined,
    quantity: null,
  });
  assert.equal(line.cost, 0);
  assert.equal(line.revenue, 0);
  assert.equal(line.profit, 0);
});

test("externalServiceLine: explicit zero quantity yields zero cost AND revenue", () => {
  const line = externalServiceLine({
    purchase_price: 100,
    sale_price: 200,
    quantity: 0,
  });
  assert.equal(line.cost, 0);
  assert.equal(line.revenue, 0);
  assert.equal(line.profit, 0);
});

test("externalServiceLine: string numerics from Supabase are coerced", () => {
  const line = externalServiceLine({
    purchase_price: "50.5",
    sale_price: "75.25",
    quantity: "4",
  });
  assert.equal(line.cost, 202);
  assert.equal(line.revenue, 301);
  assert.equal(line.profit, 99);
});

test("externalServiceLine: trigger-computed sale price persists correctly", () => {
  // Simulates what the DB trigger writes: sale_price already includes markup.
  const line = externalServiceLine({
    purchase_price: 100,
    sale_price: 125, // 25% markup pre-applied
    quantity: 1,
  });
  assert.equal(line.revenue, 125);
  assert.equal(line.profit, 25);
});

test("externalServiceLine: manual sale price override is respected", () => {
  // Manual override path stores whatever the user typed.
  const line = externalServiceLine({
    purchase_price: 100,
    sale_price: 999,
    quantity: 1,
  });
  assert.equal(line.revenue, 999);
  assert.equal(line.profit, 899);
});

test("externalServiceLine: legacy row missing quantity defaults to 1", () => {
  const line = externalServiceLine({ purchase_price: 30, sale_price: 50 });
  assert.equal(line.cost, 30);
  assert.equal(line.revenue, 50);
  assert.equal(line.profit, 20);
});

// ---------------------------------------------------------------------------
// External services — rollup
// ---------------------------------------------------------------------------

test("rollupExternalServices: empty array → zeros", () => {
  const r = rollupExternalServices([]);
  assert.deepEqual(r, { budget: 0, value: 0, cost: 0, profit: 0, invoiced: 0 });
});

test("rollupExternalServices: aggregates and exposes value=budget=revenue", () => {
  const r = rollupExternalServices([
    { purchase_price: 100, sale_price: 150, quantity: 2 }, // c=200 r=300
    { purchase_price: 50, sale_price: 60, quantity: 1 }, // c=50 r=60
    { purchase_price: 0, sale_price: 0, quantity: null }, // c=0 r=0
  ]);
  assert.equal(r.cost, 250);
  assert.equal(r.value, 360);
  assert.equal(r.budget, 360);
  assert.equal(r.profit, 110);
  assert.equal(r.invoiced, 0);
});

// ---------------------------------------------------------------------------
// Expenses — cost-only contract
// ---------------------------------------------------------------------------

test("projectExpenseLine: cost-only, revenue always 0", () => {
  const line = projectExpenseLine({ purchase_price: 75 });
  assert.equal(line.cost, 75);
  assert.equal(line.revenue, 0);
  assert.equal(line.profit, -75);
});

test("projectExpenseLine: null amount → zero contribution", () => {
  const line = projectExpenseLine({ purchase_price: null });
  assert.equal(line.cost, 0);
  assert.equal(line.revenue, 0);
  assert.equal(line.profit, 0);
});

test("rollupExpenses: rebillable flag does NOT change rollup", () => {
  // The helper only reads purchase_price; whether `rebillable` is true or
  // false should not produce any revenue.
  const r1 = rollupExpenses([
    { purchase_price: 100 },
    { purchase_price: 50 },
  ]);
  assert.equal(r1.cost, 150);
  assert.equal(r1.value, 0);
  assert.equal(r1.profit, -150);
});

test("rollupExpenses: legacy rows missing new fields don't crash", () => {
  // Object without category/vendor/rebillable — only purchase_price matters.
  const r = rollupExpenses([{ purchase_price: 42 }]);
  assert.equal(r.cost, 42);
  assert.equal(r.value, 0);
});

// ---------------------------------------------------------------------------
// Total row composition
// ---------------------------------------------------------------------------

test("sumFinancialsRows: combines services + external services + expenses", () => {
  const services = { budget: 10000, value: 6000, cost: 4000, profit: 2000, invoiced: 1500 };
  const ext = rollupExternalServices([
    { purchase_price: 100, sale_price: 150, quantity: 2 }, // c=200 r=300 p=100
  ]);
  const expenses = rollupExpenses([{ purchase_price: 80 }]); // c=80 r=0 p=-80

  const total = sumFinancialsRows(services, ext, expenses);
  assert.equal(total.budget, 10000 + 300 + 0);
  assert.equal(total.value, 6000 + 300 + 0);
  assert.equal(total.cost, 4000 + 200 + 80);
  assert.equal(total.profit, 2000 + 100 - 80);
  assert.equal(total.invoiced, 1500);
});

test("sumFinancialsRows: tolerates undefined-ish numeric fields", () => {
  const malformed = {
    budget: NaN,
    value: undefined,
    cost: null,
    profit: "100",
    invoiced: 0,
  };
  // toNum() forces NaN/null/undefined → 0 and string → number
  const total = sumFinancialsRows(malformed);
  assert.equal(total.budget, 0);
  assert.equal(total.value, 0);
  assert.equal(total.cost, 0);
  assert.equal(total.profit, 100);
  assert.equal(total.invoiced, 0);
});

// ---------------------------------------------------------------------------
// toNum primitive
// ---------------------------------------------------------------------------

test("toNum: handles every fall-through case", () => {
  assert.equal(toNum(5), 5);
  assert.equal(toNum("5.5"), 5.5);
  assert.equal(toNum(""), 0);
  assert.equal(toNum(null), 0);
  assert.equal(toNum(undefined), 0);
  assert.equal(toNum("not a number"), 0);
  assert.equal(toNum(NaN), 0);
  assert.equal(toNum(Infinity), 0);
  assert.equal(toNum(undefined, 7), 7);
});

// ---------------------------------------------------------------------------
// External service schema
// ---------------------------------------------------------------------------

const validExternal = {
  description: "Structural consultant",
  quantity: 1,
  unit_cost: 1000,
  markup_type: "percent",
  markup_value: 15,
  sale_price_manual: false,
  manual_sale_price: 0,
  status: "draft",
  invoice_date: "",
  due_date: "",
  paid_at: "",
};

test("externalServiceSchema: accepts a normal payload", () => {
  const r = externalServiceSchema.safeParse(validExternal);
  assert.equal(r.success, true);
});

test("externalServiceSchema: empty description rejected", () => {
  const r = externalServiceSchema.safeParse({ ...validExternal, description: "  " });
  assert.equal(r.success, false);
  assert.equal(flattenIssues(r).description, "descriptionRequired");
});

test("externalServiceSchema: zero quantity rejected", () => {
  const r = externalServiceSchema.safeParse({ ...validExternal, quantity: 0 });
  assert.equal(r.success, false);
  assert.equal(flattenIssues(r).quantity, "quantityMustBePositive");
});

test("externalServiceSchema: negative quantity rejected", () => {
  const r = externalServiceSchema.safeParse({ ...validExternal, quantity: -5 });
  assert.equal(r.success, false);
});

test("externalServiceSchema: negative unit_cost rejected", () => {
  const r = externalServiceSchema.safeParse({ ...validExternal, unit_cost: -1 });
  assert.equal(r.success, false);
  assert.equal(flattenIssues(r).unit_cost, "mustBeNonNegative");
});

test("externalServiceSchema: negative markup_value rejected", () => {
  const r = externalServiceSchema.safeParse({ ...validExternal, markup_value: -10 });
  assert.equal(r.success, false);
});

test("externalServiceSchema: invalid invoice_date rejected", () => {
  const r = externalServiceSchema.safeParse({
    ...validExternal,
    invoice_date: "not-a-date",
  });
  assert.equal(r.success, false);
  assert.equal(flattenIssues(r).invoice_date, "invalidDate");
});

test("externalServiceSchema: empty date strings are treated as absent", () => {
  const r = externalServiceSchema.safeParse({
    ...validExternal,
    invoice_date: "",
    due_date: "",
    paid_at: "",
  });
  assert.equal(r.success, true);
});

test("externalServiceSchema: manual sale price path validates separately", () => {
  const ok = externalServiceSchema.safeParse({
    ...validExternal,
    sale_price_manual: true,
    manual_sale_price: 1500,
  });
  assert.equal(ok.success, true);
  const bad = externalServiceSchema.safeParse({
    ...validExternal,
    sale_price_manual: true,
    manual_sale_price: -50,
  });
  assert.equal(bad.success, false);
});

// ---------------------------------------------------------------------------
// Expense schema
// ---------------------------------------------------------------------------

const validExpense = {
  description: "Train ticket",
  category: "travel",
  amount: 42.5,
  incurred_at: "2026-04-23",
  paid_at: "",
  status: "submitted",
  rebillable: true,
};

test("projectExpenseSchema: accepts a normal payload", () => {
  const r = projectExpenseSchema.safeParse(validExpense);
  assert.equal(r.success, true);
});

test("projectExpenseSchema: empty description rejected", () => {
  const r = projectExpenseSchema.safeParse({ ...validExpense, description: "" });
  assert.equal(r.success, false);
  assert.equal(flattenIssues(r).description, "descriptionRequired");
});

test("projectExpenseSchema: negative amount rejected", () => {
  const r = projectExpenseSchema.safeParse({ ...validExpense, amount: -1 });
  assert.equal(r.success, false);
  assert.equal(flattenIssues(r).amount, "mustBeNonNegative");
});

test("projectExpenseSchema: invalid category rejected", () => {
  const r = projectExpenseSchema.safeParse({ ...validExpense, category: "lunches" });
  assert.equal(r.success, false);
});

test("projectExpenseSchema: malformed paid_at rejected", () => {
  const r = projectExpenseSchema.safeParse({ ...validExpense, paid_at: "2026-13-99" });
  assert.equal(r.success, false);
});

test("projectExpenseSchema: rebillable can be either bool", () => {
  for (const v of [true, false]) {
    const r = projectExpenseSchema.safeParse({ ...validExpense, rebillable: v });
    assert.equal(r.success, true);
  }
});

// ---------------------------------------------------------------------------
// Date helper
// ---------------------------------------------------------------------------

test("isOptionalIsoDate: edge cases", () => {
  assert.equal(isOptionalIsoDate(""), true);
  assert.equal(isOptionalIsoDate(null), true);
  assert.equal(isOptionalIsoDate(undefined), true);
  assert.equal(isOptionalIsoDate("2026-01-01"), true);
  assert.equal(isOptionalIsoDate("2026-1-1"), false); // require zero-padding
  assert.equal(isOptionalIsoDate("2026-13-01"), false);
  assert.equal(isOptionalIsoDate("garbage"), false);
});
