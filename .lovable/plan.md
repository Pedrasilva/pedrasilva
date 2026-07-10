# Retainer overhaul

Simplify retainers around a fixed monthly fee with a soft hour budget, rolling utilization tracking, and dedicated insights — without losing existing data.

## Model

Each retainer phase (`pm_stages.stage_kind = 'retainer_monthly'`) is defined by:
- **Monthly fee** (fixed, €/month) — what the client is billed each month regardless of hours.
- **Included hours/month** (soft target, not a cap).
- **Anchor month** + **months count** (existing; still drives the series and payment schedule).

Hours logged against a retainer phase are always billable at the derived monthly rate. Under-runs and over-runs are expected and tracked, not blocked.

## Rolling utilization (the "recover quiet months" rule)

For each month M in the retainer:
- `used_hours(M)` = timesheet hours logged against the phase in that month.
- `rolling_avg_3m(M)` = mean of `used_hours` over M-2, M-1, M.
- `variance(M)` = `used_hours(M) − included_hours` (positive = over, negative = under).
- `rolling_variance_3m(M)` = `rolling_avg_3m(M) − included_hours`.

Warning rules (badges on the retainer monitor):
- `variance(M) > 0` and `rolling_variance_3m(M) > 0` → **red** ("sustained over-run, review scope").
- `variance(M) > 0` but `rolling_variance_3m(M) ≤ 0` → **amber** ("busy month, absorbed by quieter ones").
- `variance(M) < 0` → **green** ("under-run, capacity available for future months").

No hard cap; nothing is auto-invoiced beyond the fixed fee.

## UI changes

**Retainer monitor** (project phase view, retainer stages only):
- Replace the current dense table with a single per-month row:
  `Month · Fee (fixed) · Hours used / included · Variance · Rolling 3M avg · Status pill`.
- Header shows: monthly fee, included hours/month, months elapsed / total, cumulative variance.
- Drop the "actuals €0 because non-billable" column — cost/value stays available under a collapsed "advanced" section for finance-role users.

**Insights**: retainer phases render in a **separate Insights section** ("Retainer insights") with its own KPIs (avg utilization %, months in over-run, months in under-run, rolling variance chart). Fixed-fee stages keep the existing Insights unchanged. Mixed-mode projects show both sections stacked.

**Timesheet**: hours logged on a retainer phase are auto-flagged billable at the derived monthly rate (fee ÷ included hours). No prompt for billable/non-billable on those entries.

## Data & migration

- Add columns to `pm_stages`: `retainer_included_hours_per_month numeric`, `retainer_monthly_fee numeric` (both nullable; only meaningful when `stage_kind = 'retainer_monthly'`).
- Backfill `retainer_monthly_fee` from the existing allocations-derived monthly fee so no manual re-entry is needed.
- Backfill `retainer_included_hours_per_month` from current allocation hours.
- Existing allocations remain — they become the *default source* for the two new fields on new retainers, but the fields are now the source of truth for the monitor. This preserves the resource-allocation view without forcing it to drive fee math.
- Update `pm_time_entries` insert path: when `quote_stage_id` points at a retainer stage, force `billable = true` and stamp `sale_rate_snapshot = fee / included_hours`.

## Files

- Migration: new columns + backfill.
- `src/lib/quotes/retainer-monthly.ts`: read new columns; keep allocation-based helpers as fallback.
- `src/lib/quotes/use-retainer-monthly-actuals.ts`: add `rolling_avg_3m`, `variance`, `rolling_variance_3m`, `status` to each bucket; force billable=true when reading.
- `src/components/projects/retainer-monitor.tsx` (or current retainer monitor file): new simplified row layout + status pills.
- Insights route/component: split retainer stages into their own section.
- Timesheet entry hook: auto-billable + derived rate for retainer entries.

## Technical details

- Rolling window uses calendar months in the retainer span; months before the anchor contribute 0 used hours to the average (so early months over-run more easily — intentional, matches reality).
- Derived rate `fee / included_hours` is recomputed on read, not stored on the stage, so changing included hours re-prices historical entries consistently in the monitor. The stamped `sale_rate_snapshot` on `pm_time_entries` preserves the rate at log time for audit.
- No changes to the payment schedule generator — monthly fee still splits evenly with remainder on the last month.
- No hard cap enforcement in the DB; warnings live entirely in the UI.

Nothing existing is deleted: allocations, snapshots, and current retainer stages keep working after the migration runs.
