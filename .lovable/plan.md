# Benefits overview for the HR admin

Today the Benefits page shows expenses one by one, and the only place with balances is the "Gerir saldos" dialog, which you must open person by person. There is no single screen answering "what did each person start with, what have they used, what is left".

## What you will get

A new **Overview** area inside HR → Benefits, visible to admins and benefits approvers only.

1. **Team summary at the top**
   - Total initial balance, total credited for the year, total used, total remaining, for the whole team.
   - Split of used amounts by state: pending, approved, paid.
   - Year selector (defaults to the current year) plus an "all years" option.

2. **One row per staff member**
   - Photo and name, initial balance, credits, used, remaining.
   - A small bar showing how much of the entitlement is consumed, with a warning colour when someone is over budget.
   - Sorting by name, used, or remaining; search box; option to include archived staff.
   - Export the table to CSV.

3. **Expand a person to see the category detail**
   - Car, meal card, bonus, other benefits: initial, credited, used, remaining for each.
   - Buttons to jump to that person's expense list (filtered) and to open the existing balance editor for them.

4. **Existing screens keep working**
   - The current expense management list stays exactly as it is, moved under an "Expenses" tab next to "Overview".
   - "Gerir saldos" stays available, and is also reachable from each row.

## Technical notes

- New route file `src/routes/_app.hr.beneficios.saldos.tsx`, or a tab within `_app.hr.beneficios.tsx` (`Overview` / `Expenses`) using the existing `Tabs` in that file. Tab approach preferred — no navigation change for users.
- Data comes from tables already in place: `benefit_balances`, `benefit_yearly_credits`, and the `benefit_expenses_v` view, plus `list_collaborators_basic` for names/photos.
- Reuse `balanceByCategory`, `initialByCategory`, `creditedByCategory`, `consumedByCategory` from `src/lib/benefits.ts` — one shared fetch of all three datasets, aggregated client-side per collaborator (team size is small; no new SQL needed).
- New component `src/components/hr/BenefitsOverviewTab.tsx` with a summary card row + collapsible table; CSV via the existing export helper pattern in the benefits page.
- Gating follows the current page: `AdminView` for admins, and approvers via the existing `hr.beneficios.approve` permission check.
- All new strings added to `src/i18n/locales/en/hr.json` and `src/i18n/locales/pt-PT/hr.json` in the same edit (parity check must pass).
- No schema change, no RLS change: admins and approvers can already read all three tables.
