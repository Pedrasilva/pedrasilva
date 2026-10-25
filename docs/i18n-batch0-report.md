# Translation batch 0 — tooling and baseline

## Outcome
AST-based checker `scripts/check-i18n.mjs` scans `.tsx` under `src`, reporting literal JSX text/expressions, placeholder/title/aria-label/alt/label props, toast messages/options and confirmations. Integration and locale folders are excluded. Exact brand exceptions and document-content exceptions live in `scripts/i18n-allowlist.json`.

This is a candidate occurrence count, not unique phrases or a language classifier. It includes expressions and repeated labels, so differs from the approximate 1,400 estimate. Static analysis cannot resolve labels passed through arbitrary variables, validation schemas or helper functions; those still require review during the translation batches. Mixed document/editor files stay scanned; only explicit document-language JSX child branches are exempt, never their editor props. Internal email templates are separately generated message content, not app UI.

## Baseline by module
| Module | Candidate occurrences |
|---|---:|
| projects | 862 |
| psa-composer | 369 |
| hr | 269 |
| quotes | 246 |
| admin | 237 |
| crm | 187 |
| products | 166 |
| finance | 123 |
| shell/shared | 115 |
| snapshot | 68 |
| marketing | 61 |
| planner | 53 |
| proposals | 22 |
| ui | 17 |
| reports | 17 |
| home | 7 |
| other | 7 |
| login | 6 |
| inbox | 2 |
| shell | 2 |
| nudges | 1 |
| **Total (220 files)** | **2837** |

## Running and CI
- `npm run check:i18n`: prints counts per file and module; fails on new/increased literal signatures compared with `scripts/i18n-baseline.json`. Moving unchanged lines does not fail.
- `node scripts/check-i18n.mjs --json`: machine-readable findings with file, line, column, kind and text.
- `node scripts/check-i18n.mjs --strict`: fails while any candidate remains (expected during the migration).
- `npm run test:i18n`: checker regression tests, locale parity, baseline guard; also runs from the existing test command.
- Existing i18n CI workflow now watches TSX and checker/config changes and runs the same guard. It installs only the TypeScript AST parser; no app build is run by the checker.
- Baseline intentionally accepts existing debt only. Do not refresh it to admit new untranslated labels. Later batches can remove translated signatures to prevent reintroductions.

## Locale review
- Corrected 72 existing values in six PT-PT namespaces: crm (17), glossary (1), hr (25), inbox (13), projects (13), reports (3).
- Restricted this pass to unambiguous `actual`/`actualizar` family and `acção`/`acções`/`interacção`; preserved translation keys and interpolation tokens. Other older spelling families (e.g. projecto) are review targets for later batches, not silently rewritten here.
- Both picker locale files already say **English** and **Português**; trigger shows **EN/PT**, and supported Portuguese code is **pt-PT**. Labels unchanged.
- Finance locale/source and pending Finance work untouched; its older spellings remain explicitly deferred.
- Official Portuguese terms, glossary structure, dates/currency formatting, document output and application behavior unchanged.

## Changed files
- `scripts/check-i18n.mjs`, `scripts/i18n-allowlist.json`, `scripts/i18n-baseline.json`, `scripts/test-check-i18n.mjs`
- `.github/workflows/i18n-parity.yml`, `package.json`, root `AGENTS.md`, `roadmap.md`
- `src/i18n/locales/pt-PT/{crm,glossary,hr,inbox,projects,reports}.json`
- This report and `docs/i18n-batch0-per-file.json` (complete per-file counts and line-level findings).

## Validation
Nine checker regression tests and EN/PT parity across 12 namespaces passed. Baseline guard passed. Strict mode returns nonzero for the existing debt, as intended. No database/data changes or publishing. Batch 1 not started.
