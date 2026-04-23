#!/usr/bin/env node
/**
 * i18n parity check.
 *
 * Walks every namespace under src/i18n/locales/<lang>/<ns>.json and verifies:
 *   1. Every leaf key in language A exists in language B (and vice versa).
 *   2. Pluralized keys are complete: when one form (_one/_other/_zero/_few/_many)
 *      exists, both languages declare matching plural-suffix sets so i18next can
 *      resolve the right form regardless of count or language.
 *   3. Interpolation placeholders ({{var}}) match across languages for the same
 *      key — divergence usually means a translator missed a token.
 *
 * Exit code 0 on parity, 1 on any drift.
 *
 * Run with: node scripts/check-i18n-parity.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES_DIR = join(ROOT, "src/i18n/locales");

const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, next, out);
    } else {
      out[next] = v;
    }
  }
  return out;
}

function loadNamespace(lang, ns) {
  const path = join(LOCALES_DIR, lang, `${ns}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function listLangs() {
  return readdirSync(LOCALES_DIR).filter((entry) =>
    statSync(join(LOCALES_DIR, entry)).isDirectory(),
  );
}

function listNamespaces(lang) {
  return readdirSync(join(LOCALES_DIR, lang))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

function pluralBase(key) {
  for (const suf of PLURAL_SUFFIXES) {
    if (key.endsWith(suf)) return { base: key.slice(0, -suf.length), suffix: suf };
  }
  return null;
}

function extractPlaceholders(value) {
  if (typeof value !== "string") return [];
  const set = new Set();
  for (const m of value.matchAll(/\{\{\s*(\w+)/g)) set.add(m[1]);
  return [...set].sort();
}

const issues = [];

const langs = listLangs();
if (langs.length < 2) {
  console.log(`Only one language present (${langs.join(", ")}). Nothing to compare.`);
  process.exit(0);
}

// Use the first language as the reference for namespace discovery.
const refLang = langs[0];
const namespaces = listNamespaces(refLang);

for (const ns of namespaces) {
  // Ensure the namespace file exists in every language.
  for (const lang of langs) {
    try {
      statSync(join(LOCALES_DIR, lang, `${ns}.json`));
    } catch {
      issues.push(`[${ns}] missing namespace file in lang "${lang}"`);
    }
  }

  // Load and flatten every available copy.
  const flatByLang = {};
  for (const lang of langs) {
    try {
      flatByLang[lang] = flatten(loadNamespace(lang, ns));
    } catch (err) {
      issues.push(`[${ns}] failed to parse "${lang}/${ns}.json": ${err.message}`);
    }
  }

  // Build the union of keys.
  const allKeys = new Set();
  for (const lang of Object.keys(flatByLang)) {
    for (const k of Object.keys(flatByLang[lang])) allKeys.add(k);
  }

  // Plural cluster bookkeeping: { base -> Set<suffix> } per language.
  const pluralByLang = {};
  for (const lang of Object.keys(flatByLang)) {
    pluralByLang[lang] = new Map();
    for (const k of Object.keys(flatByLang[lang])) {
      const p = pluralBase(k);
      if (!p) continue;
      if (!pluralByLang[lang].has(p.base)) pluralByLang[lang].set(p.base, new Set());
      pluralByLang[lang].get(p.base).add(p.suffix);
    }
  }

  // 1) Per-key presence + 3) placeholder parity.
  for (const key of [...allKeys].sort()) {
    const presence = {};
    for (const lang of Object.keys(flatByLang)) {
      presence[lang] = key in flatByLang[lang];
    }
    const missingIn = Object.keys(presence).filter((l) => !presence[l]);

    // If this key is part of a plural cluster, presence is allowed to vary by suffix
    // (handled in step 2). Skip the strict per-key check for plural variants.
    const p = pluralBase(key);
    if (!p && missingIn.length > 0) {
      issues.push(`[${ns}] key "${key}" missing in: ${missingIn.join(", ")}`);
    }

    // Placeholder parity (only when the key exists in 2+ languages).
    const presentLangs = Object.keys(presence).filter((l) => presence[l]);
    if (presentLangs.length >= 2) {
      const refPh = extractPlaceholders(flatByLang[presentLangs[0]][key]);
      for (const lang of presentLangs.slice(1)) {
        const ph = extractPlaceholders(flatByLang[lang][key]);
        const missing = refPh.filter((x) => !ph.includes(x));
        const extra = ph.filter((x) => !refPh.includes(x));
        if (missing.length || extra.length) {
          issues.push(
            `[${ns}] placeholder mismatch on "${key}" between "${presentLangs[0]}" (${refPh.join(",") || "—"}) and "${lang}" (${ph.join(",") || "—"})`,
          );
        }
      }
    }
  }

  // 2) Plural cluster parity. For every plural base, all languages must declare
  // a non-empty set of suffixes and at minimum cover _one and _other (the
  // English/Portuguese minimum for i18next CLDR plural rules).
  const allBases = new Set();
  for (const lang of Object.keys(pluralByLang)) {
    for (const b of pluralByLang[lang].keys()) allBases.add(b);
  }
  for (const base of [...allBases].sort()) {
    for (const lang of Object.keys(pluralByLang)) {
      const suffixes = pluralByLang[lang].get(base) ?? new Set();
      if (suffixes.size === 0) {
        issues.push(`[${ns}] plural base "${base}" missing entirely in "${lang}"`);
        continue;
      }
      if (!suffixes.has("_other")) {
        issues.push(
          `[${ns}] plural base "${base}" missing required "_other" form in "${lang}" (has: ${[...suffixes].join(",")})`,
        );
      }
      if (!suffixes.has("_one")) {
        issues.push(
          `[${ns}] plural base "${base}" missing "_one" form in "${lang}" (has: ${[...suffixes].join(",")})`,
        );
      }
    }
  }
}

if (issues.length === 0) {
  console.log(`✓ i18n parity OK across [${langs.join(", ")}] for ${namespaces.length} namespaces.`);
  process.exit(0);
}

console.error(`✗ i18n parity check found ${issues.length} issue(s):`);
for (const issue of issues) console.error("  - " + issue);
process.exit(1);
