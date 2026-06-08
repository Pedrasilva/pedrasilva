# Fee-only retainer mode

Add a "fee-only" flavor to monthly retainers: just a monthly amount × duration. Anyone logs hours against the retainer through the existing timesheet; each month shows cost-vs-fee (margin) and value-vs-fee (delivery) over/under indicators.

## Data model

**`quote_stages`** (retainer rows already exist as `stage_kind = 'retainer_monthly'`)
- Add `is_fee_only boolean not null default true` — when true, allocations are not required and the planning Gantt hides allocation rows for this stage.
- Keep existing `retainer_monthly_amount` and `retainer_months` as the source of truth for the monthly fee.

**`pm_time_entries`** (timesheet)
- Add nullable `quote_stage_id uuid references quote_stages(id) on delete set null`.
- Add CHECK: a row targets EITHER a `task_id` (project work) OR a `quote_stage_id` where the stage is a retainer — never both, never neither.
- Index on `(quote_stage_id, date)` for monthly rollups.

Cost/sale rates resolve the same way they do for project entries: from the logging collaborator's `pm_resources` row at entry date (cost_rate, hourly_rate as sale).

RLS: mirrors the existing `pm_time_entries` policies; readers of the parent quote can read the entries, the logger can write their own.

## Timesheet integration

In the timesheet target picker (currently project → stage → task), add a second tab "Retainer". It lists active retainer stages from quotes the user can see (quote not archived, retainer month range covers today ± a small window). Selecting one writes a `pm_time_entries` row with `quote_stage_id` set and `task_id` null.

No other timesheet logic changes — billable flag, hours, date, notes all behave the same.

## Monthly readings (new component on the retainer editor)

Below the existing retainer stage editor, render a table: one row per retainer month (anchor → anchor + N).

Per month columns:
- **Fee** — `retainer_monthly_amount` (last month carries any rounding remainder, same as payment generator).
- **Hours logged** — Σ hours of `pm_time_entries` where `quote_stage_id = stage.id` and entry month = row month.
- **Cost** — Σ hours × resource cost_rate at entry date.
- **Value** — Σ billable hours × resource sale_rate at entry date.
- **Margin Δ** = Fee − Cost. Pill: green if ≥ 0, red if < 0.
- **Delivery Δ** = Value − Fee. Pill: green if ≥ 0 (delivering ≥ what we charge), amber if under.

Footer row totals all months. Current month is highlighted.

Implemented as a `useQuery` hook `useRetainerMonthlyActuals(quoteId, stageId)` that:
1. Reads the stage (`retainer_monthly_amount`, `retainer_months`, anchor month).
2. Reads `pm_time_entries` joined to `pm_resources` for cost/sale rates.
3. Buckets by `to_char(date, 'YYYY-MM')`.

No server function needed — RLS-scoped client query is sufficient.

## UI surfaces

1. **Retainer stage editor** — new "Fee-only" toggle at the top (default on for new retainers). When on: allocation rows + Gantt block are hidden; only fee + months + anchor remain. Existing planned retainers stay as they were.
2. **Quote planning tab** — fee-only retainers render as a compact card (fee, months, anchor) instead of a Gantt strip.
3. **Monthly readings panel** — shows under the editor whenever the retainer has at least one logged hour OR the anchor month is ≤ today.
4. **Timesheet** — retainer target tab as described above.

## Out of scope (this phase)

- Retainer invoicing/payment items already auto-generate from `retainer_monthly` via the payment generator; no change there.
- Roll-over of unused hours between months — not part of this request.
- Forecasting future cost on fee-only retainers (no allocations means nothing to forecast).

## Files

**Migrations (one):**
- Add `is_fee_only` to `quote_stages`, `quote_stage_id` + CHECK to `pm_time_entries`, index, RLS update.

**New:**
- `src/lib/quotes/use-retainer-monthly-actuals.ts` — monthly rollup hook.
- `src/components/quotes/retainer-monthly-readings.tsx` — readings table.
- `src/components/timesheet/retainer-target-picker.tsx` — timesheet tab (location depends on current timesheet structure; I'll wire it into the existing target picker).

**Edits:**
- `src/components/quotes/retainer-stage-editor.tsx` — add fee-only toggle, conditionally hide allocation UI, mount readings panel.
- `src/components/quotes/quote-planning-tab.tsx` — render fee-only retainers as a card.
- `src/lib/quotes/types.ts` — surface `is_fee_only`.
- Existing timesheet entry component — add retainer tab + wire `quote_stage_id` through the write path.
- `src/i18n/locales/en/crm.json` + `pt-PT/crm.json` — new keys (`feeOnly`, `monthlyReadings`, `margin`, `delivery`, `feeBilled`, etc.) and timesheet retainer tab labels under the timesheet namespace.

I'll find the current timesheet entry file before editing (likely under `src/components/projects/` or `src/routes/_app.projects.timesheet.tsx`); the rest is straightforward from the codebase context already loaded.
