#!/usr/bin/env node
/**
 * Snapshot tests for the holiday-count phrasing in src/routes/_app.hr.dias-uteis.tsx.
 *
 * The page composes three pluralized i18n keys to render the holiday card
 * description:
 *   hr:diasUteis.holidays.description_(zero|one|other)
 *   hr:diasUteis.holidays.workingClause_(zero|one|other)
 *   hr:diasUteis.holidays.weekendClause_(zero|one|other)
 *
 * Plus a single pluralized toast:
 *   hr:diasUteis.toasts.appliedToSnapshots_(one|other)
 *
 * This script reproduces i18next's CLDR-style plural selection and {{var}}
 * interpolation, then asserts the rendered string for every meaningful
 * (total, working, weekend) combination matches a frozen expected output for
 * both EN and PT. Any wording change to the locale files must be paired with
 * an intentional update to the snapshots below — that is the whole point.
 *
 * Exit code 0 on pass, 1 on any mismatch. No npm dependencies.
 *
 * Run with: node scripts/test-holiday-clauses.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = join(ROOT, "src/i18n/locales");

function load(lang) {
  return JSON.parse(readFileSync(join(LOCALES, lang, "hr.json"), "utf8"));
}

// English and European Portuguese both use the simple {one, other} CLDR rule
// for cardinal numbers, so i18next will resolve count===0 to the "_other"
// suffix. The route handles the "no holidays" empty state explicitly via the
// descriptionEmpty key (NOT a _zero plural variant) — this mirrors that.
function pluralKey(base, count) {
  if (count === 1) return `${base}_one`;
  return `${base}_other`;
}

function interp(str, vars) {
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    vars[k] === undefined ? `{{${k}}}` : String(vars[k]),
  );
}

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, next, out);
    else out[next] = v;
  }
  return out;
}

function renderHolidayDescription(lang, total, working, weekend) {
  const flat = flatten(load(lang).diasUteis);
  if (total === 0) return flat["holidays.descriptionEmpty"];
  const wcKey = `holidays.${pluralKey("workingClause", working)}`;
  const weKey = `holidays.${pluralKey("weekendClause", weekend)}`;
  const dKey = `holidays.${pluralKey("description", total)}`;
  const workingClause = interp(flat[wcKey], { count: working });
  const weekendClause = interp(flat[weKey], { count: weekend });
  return interp(flat[dKey], { count: total, workingClause, weekendClause });
}

function renderAppliedToast(lang, n) {
  const flat = flatten(load(lang).diasUteis);
  const k = `toasts.${pluralKey("appliedToSnapshots", n)}`;
  return interp(flat[k], { count: n });
}

// ---- Snapshots ---------------------------------------------------------------
// (total, working, weekend) -> expected string, per language.
// Bumping any of these requires a deliberate copy change.

const DESCRIPTION_CASES = [
  // [total, working, weekend, label]
  [0, 0, 0, "no holidays"],
  [1, 1, 0, "single holiday on a working day"],
  [1, 0, 1, "single holiday on a weekend"],
  [2, 1, 1, "two holidays split"],
  [3, 3, 0, "all on working days"],
  [3, 0, 3, "all on weekends"],
  [13, 11, 2, "typical Portuguese year"],
];

const EXPECTED_DESCRIPTION = {
  en: {
    "0/0/0": "No holidays registered for this year.",
    "1/1/0": "1 holiday — 1 on a working day, 0 on weekends (no impact).",
    "1/0/1": "1 holiday — 0 on working days, 1 on a weekend (no impact).",
    "2/1/1": "2 holidays — 1 on a working day, 1 on a weekend (no impact).",
    "3/3/0": "3 holidays — 3 on working days, 0 on weekends (no impact).",
    "3/0/3": "3 holidays — 0 on working days, 3 on weekends (no impact).",
    "13/11/2": "13 holidays — 11 on working days, 2 on weekends (no impact).",
  },
  "pt-PT": {
    "0/0/0": "Sem feriados registados para este ano.",
    "1/1/0": "1 feriado — 1 em dia útil, 0 ao fim-de-semana (sem impacto).",
    "1/0/1": "1 feriado — 0 em dias úteis, 1 ao fim-de-semana (sem impacto).",
    "2/1/1": "2 feriados — 1 em dia útil, 1 ao fim-de-semana (sem impacto).",
    "3/3/0": "3 feriados — 3 em dias úteis, 0 ao fim-de-semana (sem impacto).",
    "3/0/3": "3 feriados — 0 em dias úteis, 3 ao fim-de-semana (sem impacto).",
    "13/11/2": "13 feriados — 11 em dias úteis, 2 ao fim-de-semana (sem impacto).",
  },
};

const TOAST_CASES = [0, 1, 2, 5];
const EXPECTED_TOAST = {
  en: {
    0: "Applied to 0 snapshots and BO settings",
    1: "Applied to 1 snapshot and BO settings",
    2: "Applied to 2 snapshots and BO settings",
    5: "Applied to 5 snapshots and BO settings",
  },
  "pt-PT": {
    0: "Aplicado a 0 fichas e às definições BO",
    1: "Aplicado a 1 ficha e às definições BO",
    2: "Aplicado a 2 fichas e às definições BO",
    5: "Aplicado a 5 fichas e às definições BO",
  },
};

// ---- Runner ------------------------------------------------------------------

const failures = [];
let passed = 0;

for (const lang of ["en", "pt-PT"]) {
  for (const [t, w, e, label] of DESCRIPTION_CASES) {
    const actual = renderHolidayDescription(lang, t, w, e);
    const key = `${t}/${w}/${e}`;
    const expected = EXPECTED_DESCRIPTION[lang][key];
    if (actual === expected) {
      passed++;
    } else {
      failures.push(
        `[${lang}] holiday description (${label}) ${key}\n    expected: ${expected}\n    actual:   ${actual}`,
      );
    }
  }
  for (const n of TOAST_CASES) {
    const actual = renderAppliedToast(lang, n);
    const expected = EXPECTED_TOAST[lang][n];
    if (actual === expected) {
      passed++;
    } else {
      failures.push(
        `[${lang}] appliedToSnapshots toast count=${n}\n    expected: ${expected}\n    actual:   ${actual}`,
      );
    }
  }
}

if (failures.length === 0) {
  console.log(`✓ Holiday clause snapshots passed (${passed} cases across en, pt-PT).`);
  process.exit(0);
}

console.error(`✗ Holiday clause snapshots: ${failures.length} mismatch(es)`);
for (const f of failures) console.error("  - " + f);
console.error(
  "\nIf this change is intentional, update EXPECTED_DESCRIPTION / EXPECTED_TOAST in this file.",
);
process.exit(1);
