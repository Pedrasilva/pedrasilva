# Permissions v2 — UX fixes, 11 November 2026

- Permission and scope dropdowns now provide live accent-insensitive filtering against both EN and PT labels. Permission search includes section names and keys. Arrow keys and Enter select; no-match state is translated.
- Account search now ignores accents, includes bilingual role labels, and supports arrows/Enter. Example: `conceicao` selects Ricardo Conceição.
- Permission options show **From role / Do perfil** and **Granted / Autorizado** based on the existing effective rows, independently of the currently selected option. Admin accounts show the existing administrator status. These tags are display-only and never authorize anything.
- Catalogue audit identified exactly two broken mapped keys in both languages: `timesheet73` and `hr2061646d696e697374726174696f6e`. Both now reference existing translated keys: `timesheets` and `hrAdministration`. No other catalogue-map key is missing in EN or PT.
- No permissions, role mappings, data, or B1 settings changed. Browser checks selected options only; no Grant/Revoke action was clicked. Portuguese screenshot used browser-local language interception, not a saved account preference.

## Verification

- Authenticated browser: account accent search/Enter, bilingual permission-name/section filtering, no results, ArrowDown/Enter, scope search/Enter; passed in EN and PT.
- Existing Ricardo grants and role tags visible from live read-only data.
- Two focused search tests pass; translation parity passes across 13 namespaces; AST untranslated UI candidates: zero. Latest build signal: build OK.
- [English dropdown](permissions-v2-ux/dropdown.png)
- [Portuguese dropdown](permissions-v2-ux/dropdown-pt.png)
- [Folhas de horas heading](permissions-v2-ux/timesheets-pt.png)

## Files changed

- `src/routes/_app.admin.permissions.tsx`
- `src/components/permission-search-picker.tsx`
- `src/lib/permission-picker-search.ts`
- `src/i18n/locales/en/access.json`
- `src/i18n/locales/pt-PT/access.json`
- `scripts/test-permission-picker-search.test.ts`
- This report, its three screenshots, and `roadmap.md`.

No authorization logic, migrations or product decisions changed. The attempted architecture-note addition was not saved because the root AGENTS.md budget is exhausted; existing user-written rules were preserved.