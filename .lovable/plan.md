# Stage as envelope, tasks as allocations inside it

## Audit of what exists today

**Stages** — `pm_stages`: `budget` (the money envelope, already used as "original budget" in the budget-control panel), `baseline_target_hours`, `start_date`/`end_date`, `status`, parent/child nesting, retainer fields. No stored allocated/remaining totals.

**Tasks** — `pm_tasks`: `name`, `status`, `allocation_id`, timestamps. Strictly 1:1 with an allocation. No notes field.

**Allocations** — `pm_allocations`: `stage_id`, `resource_id`, `start_date`, `end_date`, `hours_per_day`. Hours are always derived: `workingDays(start,end) × hours_per_day` (`src/lib/projects/gantt-utils.ts`).

**Rates** — `effectiveCostRate` / `effectiveSaleRate` in `src/lib/projects/use-default-rates.ts` (HR-derived defaults, with per-resource override). Nothing stored per task.

**Stage hours envelope** — already derived in the dashboard: allocation hours if any, otherwise `budget ÷ average sale rate`. `baseline_target_hours` exists when a baseline was locked.

**Financial permission** — `useHasPermission("projects.financials")` → `canSeeFinancials`, already gating every money column in the Milestones table and the sidebar.

**Add Task path** — stage kebab (`stage-row-actions.tsx`) → `CreateStageTaskDialog` → `useCreateStageTask` (inserts the allocation, renames the auto-created task).

**Double-click on a task** — does not exist. The pencil / kebab "Edit plan" only switches to the Schedule tab.

**Rollups** — all derived at render time; no cached totals anywhere. Good: nothing to keep in sync.

## What changes (smallest additive path)

Everything stays derived — no new tables, no stored totals, no second planning engine.

### 1. One shared envelope calculator
New `src/lib/projects/use-stage-envelope.ts` with a pure function that, given a stage + its allocations + the rate map, returns:
- total hours (`baseline_target_hours` if set, else the existing budget ÷ avg sale rate fallback)
- allocated hours, remaining hours
- cost envelope (`stage.budget`), allocated cost, remaining cost
- projected sale value of allocations
- an optional `excludeAllocationId` so edit mode never double-counts the task being edited

It reuses `allocationHours` and the existing rate helpers — no new formulas.

### 2. Task dialog becomes Add **and** Edit
`create-stage-task-dialog.tsx` gains an `edit` mode (same form, same fields) and a stage-context panel:
- Header: "Add task / Edit task — Stage: <name>"
- Stage hours: total / allocated / remaining
- Admin only: cost envelope, allocated cost, remaining cost, projected sale value
- Live Before → this task → After strip that recalculates as dates/hours/resource change
- Warning when the task pushes the stage over its hours (and, for admins, over its cost). Save is not blocked.
- Notes field, saved on the task

Edit mode saves through the existing `useUpdateAllocation` plus a task-name/status update — it updates the same row, never creating a duplicate.

### 3. Double-click to edit
Task rows in the Milestones table and task bars in the Gantt open that dialog in edit mode.

### 4. Stage row feedback
Stage rows show `60 / 100 h · 40 h remaining` with a slim progress bar. Admins additionally see allocated vs. envelope money. Staff see hours only — reusing `canSeeFinancials`, no new permission.

### 5. Task row detail
Task rows show the person and their allocated hours; the cost only appears for admins.

Delete already works through `useDeleteAllocation`; because every total is derived, deleting immediately returns the hours and money to the stage.

## Technical notes

- One additive migration: nullable `pm_tasks.notes`. Nothing else in the database changes.
- Untouched: `computePricing`, `cotaBoPorColabProjecto`, hybrid resource cost, `cost_rate`/`sale_rate`, quote snapshots, project profitability, BO overhead.
- Planned allocation stays separate from logged timesheet hours; the existing actuals columns are left as they are.

## Validation

Walk the acceptance scenario in the preview: create a 40 h task in a stage, check allocated/remaining, edit it to 80 h and confirm only the delta moves, delete it and confirm full restore. Plus a TypeScript check and an i18n parity check.
