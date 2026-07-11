
## Goal

One operational retainer model, owned by the project. A retainer is a dated band on the project Gantt with a monthly fee. Anyone can clock hours against it. The monitor compares monthly hours × cost/sale against the monthly fee, with a 3-month rolling health signal.

## Concept

A **Project Construction Retainer** is a stage on the project Gantt with:
- `stage_kind = 'retainer'`
- `monthly_fee` (€/month, fixed)
- `anchor_month` + `months` → derives start/end and the length of the Gantt bar
- `source_quote_stage_id` (nullable) — optional link back to the quote stage that originated it
- No pre-planned allocations required. No "included hours" target stored — hours are free-form.

Two creation paths, one model:
1. **Quote-originated**: on project bootstrap, an approved quote retainer stage seeds one Project Construction Retainer. The quote row stays as the commercial baseline; the project row is the live source of truth for actuals.
2. **Direct**: user adds a retainer stage from inside the project Gantt (new "Retainer" option in the stage-kind picker).

## Data model

New (or repurposed) fields on `pm_stages`:
- `stage_kind` gains `'retainer'`
- `monthly_fee numeric`
- `retainer_anchor_month date` (first of month)
- `retainer_months int`
- `source_quote_stage_id uuid null references quote_stages(id)` — commercial baseline pointer

Time entries: reuse `pm_time_entries` with `entry_type = 'retainer'` and `project_stage_id` (or the existing retainer stage FK) pointing at the project retainer stage. Snapshot `cost_rate_snapshot` and `sale_rate_snapshot` from the logging resource at write time so history stays stable.

RLS: any authenticated user who can see the project can insert a retainer time entry against its retainer stages (open logging). Edit/delete their own; PM/admin can edit any.

## Gantt integration

- Retainer stages render as a distinct band (different fill/pattern) on the project Gantt, spanning `anchor_month` → `anchor_month + months`.
- They coexist with regular design/construction deliverable stages (no separate panel; the Gantt is still the single planning surface).
- Retainer stages are NOT rolled up as normal parent stages — their budget is `monthly_fee × months`, not the sum of children.
- Clicking a retainer stage opens the **Retainer Monitor** panel below the Gantt (replacing the current quote-side `RetainerMonitorPanel` usage in the project view).

## Retainer Monitor (per stage)

Header
- Monthly fee, total fee (fee × months), span (anchor month → end month).
- Rolling 3-month health pill: green (avg cost ≤ fee), amber (avg cost > fee but delivered sale within tolerance), red (avg cost > fee for ≥2 of last 3 months).

Monthly table (one row per month in span + overflow months if entries fall outside)
- Month, Hours, Cost (Σ hours × cost_rate_snapshot), Sale (Σ billable hours × sale_rate_snapshot), Fee, **Margin = Fee − Cost**, **Delivered vs Fee = Sale − Fee**, status pill.
- Row-level status uses the 3-month rolling window ending at that month.

By-resource breakdown (already added in the last turn — keep and reuse)
- Hours, Cost, Sale, Margin per resource across the whole retainer span.

Entry list under the table, edit/delete own entries.

## Migration path

1. New `stage_kind = 'retainer'` on `pm_stages` + new columns.
2. Backfill: for each project bootstrapped from a quote with a `retainer_monthly` quote stage, insert a matching `pm_stages` row with `source_quote_stage_id` set, copy `monthly_fee`, `retainer_anchor_month`, `retainer_months`.
3. Re-point existing `pm_time_entries` currently attached to quote retainer stages (`entry_type='retainer'`, `quote_stage_id=...`) to the new project retainer stage.
4. Quote-side `stage_kind='retainer_monthly'` remains for pricing/proposal only. The project view no longer reads from it.

## UI changes

- **Project Gantt**: add "Retainer" to the stage-kind picker in the "New stage" / stage settings dialog. Retainer stages render with a distinct visual and a monthly-fee inline editor.
- **Retainer Monitor**: rebuild the project-side monitor around the new project retainer stage. Reuse existing components (`retainer-monitor-panel.tsx`) but drive them from `pm_stages` + `pm_time_entries` instead of `quote_stages`.
- **Timesheet**: expose all `stage_kind='retainer'` stages of projects the user can see, regardless of allocation.
- **Quote builder**: unchanged for pricing. Add a small "This retainer is live on project X" link when a quote retainer stage has a downstream `pm_stages` row.

## Out of scope for this iteration

- Extensions/renewals (adding months mid-flight) — supported by editing `retainer_months`, no formal review workflow yet.
- Negotiated adjustments to `monthly_fee` mid-term with historical preservation — for now a fee change applies going forward; historical months keep their persisted fee via a `monthly_fee_snapshot` on each month's aggregate (future work).
- Expenses attached to retainers (separate from hours) — out of scope.

## Technical outline

```text
pm_stages
├─ stage_kind: 'deliverable' | 'retainer' | ...
├─ monthly_fee, retainer_anchor_month, retainer_months  (retainer only)
└─ source_quote_stage_id → quote_stages.id (nullable)

pm_time_entries (existing)
└─ entry_type='retainer', project_stage_id → pm_stages.id (retainer)
   cost_rate_snapshot, sale_rate_snapshot captured at write

Project Gantt
├─ regular stages (existing rollup)
└─ retainer stages (fee-driven band, no children rollup)

Retainer Monitor (project-side)
├─ Monthly table: hours / cost / sale / fee / margin
├─ 3-month rolling status
└─ By-resource breakdown
```

## Deliverables (implementation order)

1. Migration: `pm_stages` columns + `stage_kind='retainer'` + optional `source_quote_stage_id`.
2. Backfill script for existing quote-originated retainers.
3. Gantt: retainer stage rendering + create/edit dialog.
4. Project-side Retainer Monitor wired to `pm_stages` + `pm_time_entries`.
5. Timesheet: retainer picker across accessible projects.
6. Retire the quote-driven project retainer path (keep quote stage for pricing only).

Confirm this shape and I'll start with step 1.
