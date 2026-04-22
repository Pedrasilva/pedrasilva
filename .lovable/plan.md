

## Goal
Replace the plain company `Select` everywhere with a single shared **CompanyPicker** that lets users either pick an existing company **or** create a new one inline — no more dead-end when the company isn't in the list.

## Component to build

**`src/components/crm/company-picker.tsx`** — one reusable component, used in every place that currently asks for `company_id`.

UI: a searchable combobox (built on existing `Command` + `Popover` primitives — same pattern as shadcn).
- Type to filter existing companies by name
- Shows matching results with a small "Industry · status" subtitle
- If no match (or always at the bottom): a **"+ Create new company: '<typed text>'"** action
- Clicking it opens the existing `CompanyDialog` (extracted from `QuickCreateMenu`) pre-filled with the typed name
- After creation, auto-selects the new company and closes both popups

Props:
```ts
{
  value: string | null;
  onChange: (companyId: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}
```

## Refactor: extract the company creation dialog

`CompanyDialog` is currently locked inside `QuickCreateMenu.tsx`. Move it to:

**`src/components/crm/new-company-dialog.tsx`** — accepts an optional `defaultName` prop and an `onCreated(companyId)` callback so the picker can auto-select after creation. `QuickCreateMenu` re-imports it (no behavior change there).

## Call sites to update (5 files)

Each one currently has the same `Select`/`SelectContent`/`SelectItem` block over `companies-lite`. Replace with `<CompanyPicker value={...} onChange={...} />`:

1. `src/routes/_app.crm.opportunities.tsx` — New opportunity dialog (your reported case)
2. `src/routes/_app.crm.accounts.tsx` — New account dialog
3. `src/routes/_app.crm.pipeline.tsx` — New proposal dialog
4. `src/routes/_app.crm.pipeline.$proposalId.tsx` — Proposal detail (change company)
5. `src/components/QuickCreateMenu.tsx` — Contact dialog AND Project dialog (2 spots)

The shared `["companies-lite"]` query key is reused so a single `invalidateQueries(["companies-lite"])` after creation refreshes every picker on screen.

## i18n
Add to `common` namespace (per memory rules — shared atom across modules):
- `common.companyPicker.search` — "Search company…" / "Procurar empresa…"
- `common.companyPicker.empty` — "No companies found" / "Sem empresas"
- `common.companyPicker.createNew` — "Create new company" / "Criar nova empresa"
- `common.companyPicker.createNewWith` — "Create '{name}'" / "Criar '{name}'"

Both `en/common.json` and `pt-PT/common.json` updated in the same edit (parity rule).

## Out of scope
- Not changing the `CompanyDialog` field set
- Not changing `companies` schema or RLS
- Not touching contact/account pickers (separate follow-up if desired)

## Files touched
- **Create**: `src/components/crm/company-picker.tsx`, `src/components/crm/new-company-dialog.tsx`
- **Edit**: `src/routes/_app.crm.opportunities.tsx`, `src/routes/_app.crm.accounts.tsx`, `src/routes/_app.crm.pipeline.tsx`, `src/routes/_app.crm.pipeline.$proposalId.tsx`, `src/components/QuickCreateMenu.tsx`, `src/i18n/locales/en/common.json`, `src/i18n/locales/pt-PT/common.json`

