## Scope

Five connected changes to the planner Gantt (CRM quotes + project module — shared component).

### 1. Parent stage rolls up sale value

- Today: parent/summary rows show their own `budget` field, which is usually `0` or stale; only dates roll up.
- Change: parent budget shown in the Gantt and in totals = **sum of children's effective sale value** (recursive). Leaf rows keep their stored budget. The synthetic top "Project" row sums all root stages.
- Affects: `buildProjectGanttTree.ts`, the equivalent quote tree builder in `planner-gantt.tsx`, and any "Total budget" KPI that currently re-sums leaves.

### 2. Parent WBS row is clickable

- Today: clicking a summary row is a no-op (the inspector is disabled because parents are read-only).
- Change: clicking opens the same inspector drawer in a **read-only "Summary" mode** showing:
  - Name, rolled-up dates, rolled-up sale value, rolled-up cost, rolled-up margin
  - Children list (name + budget + dates)
  - No editable fields, no Resources / Dependencies tabs

### 3. Budget mode selector on stage inspector

Replace the flat "Budget" input with an Accelo-style mode dropdown:

| Mode | Behaviour |
|---|---|
| **Fixed** | Manual € amount (current behaviour) |
| **Calculated** | Sale value = Σ(allocation hours × resource sale rate); input is locked + shows computed total |
| **Non-billable** | Sale value forced to €0; excluded from project total and payment schedule |

DB: add `budget_mode` enum (`fixed` \| `calculated` \| `non_billable`, default `fixed`) to `quote_stages` and `pm_stages`. Default existing rows to `fixed`. All sale-value reads route through one helper `getStageSaleValue(stage, allocations, rates)` so every surface (Gantt, payment schedule, financial summary, rollups) stays consistent.

### 4. "Update" button on payment schedule

Add a manual **Recompute from plan** button on `quote-payment-schedule-tab.tsx`. Today the schedule re-derives on stage edits via hooks; the button gives users an explicit re-sync action (also covers cases where mode changes don't auto-trigger). Shows a toast on success with a count of items updated.

### 5. Bug fixes

- **Category=Supplier not saving in inspector**: the category select onChange writes to local state but `mutate` only includes whitelisted fields — verify `category` (and supplier-mode flag) is in the update payload and persisted; add to mutation if missing.
- **Master Card Gantt missing values**: investigate — likely the budget column isn't displaying for parent rows because they have no `budget` themselves (fixed by #1) and/or stages outside the date window are clipped. Will inspect that project's data and confirm.

## Technical details

- Migration: add `budget_mode` to `quote_stages` + `pm_stages`; helper SQL function `get_stage_sale_value(stage_id)` is **not** needed — we compute client-side from already-loaded allocations.
- New util: `src/lib/quotes/stage-sale-value.ts` (shared by both modes via planner adapter).
- Inspector: budget input becomes a `<Tabs>` segmented control (Fixed/Calculated/Non-Billable) with the input field shown only in Fixed mode, a read-only "Calculated: €X" display in Calculated mode, and a "Non-billable" badge otherwise.
- Summary-mode inspector: reuse current `quote-planner-inspector.tsx` component, branch on `isSummary` to render a compact `<SummaryView>` instead of the editable form.
- Payment schedule button: calls existing regenerate hook (`useGeneratePaymentSchedule` / equivalent) then invalidates queries.

## Out of scope

- New financial reports
- Changing how payment rules are configured
- Mobile layout polish

Will run in one pass: migration first, then code in parallel edits. Verification: open Master Card quote, confirm rollup totals, toggle mode, click parent, save Supplier category.