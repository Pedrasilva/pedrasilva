# Stage as envelope, tasks as allocations inside it

## Audit of what exists today

**Stages** — `pm_stages`: `budget` — the agreed **client sale value** of the stage (the budget-control panel treats it as the "original budget"), `baseline_target_hours`, `start_date`/`end_date`, `status`, parent/child nesting, retainer fields. No stored allocated/remaining totals.

**Tasks** — `pm_tasks`: `name`, `status`, `allocation_id`, timestamps. Strictly 1:1 with an allocation. No notes field.

**Allocations** — `pm_allocations`: `stage_id`, `resource_id`, `start_date`, `end_date`, `hours_per_day`. Hours are always derived: `workingDays(start,end) × hours_per_day` (`src/lib/projects/gantt-utils.ts`).

**Target margin** — already stored: `pm_stage_commercial_baselines.target_margin_pct` per stage and `pm_project_commercial_baselines.target_gross_margin_pct` per project (used by the forecast metrics). No new setting needed.

**Rates** — `effectiveCostRate` / `effectiveSaleRate` in `src/lib/projects/use-default-rates.ts` (HR-derived defaults, with per-resource override). Nothing stored per task.

**Stage hours envelope** — already derived in the dashboard: allocation hours if any, otherwise `sale value ÷ average sale rate`. `baseline_target_hours` exists when a baseline was locked.

**Financial permission** — `useHasPermission("projects.financials")` → `canSeeFinancials`, already gating every money column in the Milestones table and the sidebar.

**Add Task path** — stage kebab (`stage-row-actions.tsx`) → `CreateStageTaskDialog` → `useCreateStageTask` (inserts the allocation, renames the auto-created task).

**Double-click on a task** — does not exist. The pencil / kebab "Edit plan" only switches to the Schedule tab.

**Rollups** — all derived at render time; no cached totals anywhere. Good: nothing to keep in sync.

## What changes (smallest additive path)

Everything stays derived — no new tables, no stored totals, no second planning engine.

### 1. One shared envelope calculator
New `src/lib/projects/use-stage-envelope.ts` with a pure function that, given a stage + its allocations + rates + target margin, returns:

- **Hours** — capacity (`baseline_target_hours` if set, otherwise the existing sale value ÷ average sale rate derivation, unchanged), allocated hours, remaining hours
- **Money** — Stage Sale Value (`pm_stages.budget`), Target Margin, Target Planned Cost (`sale value × (1 − target margin)`), Allocated Planned Cost (Σ allocation hours × that resource's effective cost rate), Remaining Target Cost Capacity, Projected Margin (`(sale value − planned cost) ÷ sale value`), margin variance vs. target
- an optional `excludeAllocationId` so edit mode never double-counts the task being edited

Target margin resolution order: stage commercial baseline → project commercial baseline → 50% fallback. Nothing hard-coded when a configured value exists.

Note the intentional asymmetry, as confirmed: stage hours capacity uses the **average sale rate**; task planned cost uses each assigned resource's **effective cost rate**.

### 2. Task dialog becomes Add **and** Edit
`create-stage-task-dialog.tsx` gains an `edit` mode (same form, same fields) and a stage-context panel:

- Header: "Add task / Edit task — Stage: <name>"
- Everyone: stage hours — capacity / allocated / remaining
- Management only, live Before → This task → After:
  - Before: Stage Sale Value, Target Margin, Target Planned Cost, currently Planned Cost, Projected Margin
  - This task: hours and planned cost
  - After: Planned Stage Cost, Remaining Target Cost Capacity, Projected Stage Margin
- Warnings (never blocking): "Task allocation exceeds the remaining stage capacity by X h" and, for management, "Projected stage margin falls to 45%, below the 50% target."
- Notes field, saved on the task

Values recalculate live as resource, dates or hours/day change. Edit mode saves through the existing `useUpdateAllocation` plus a task-name/status update — same row, never a duplicate.

### 3. Double-click to edit
Task rows in the Milestones table and task bars in the Gantt open that dialog in edit mode.

### 4. Stage row feedback
Stage rows show `60 / 100 h · 40 h remaining` with a slim progress bar. With `projects.financials`, the row also shows planned cost against target cost capacity and the projected margin. Staff see hours only — no new permission.

### 5. Task row detail
Task rows show the person and their allocated hours; planned cost only with `projects.financials`.

Delete already works through `useDeleteAllocation`; because every total is derived, deleting immediately returns the hours and money to the stage.

## Terminology

Stage Sale Value · Target Margin · Target Planned Cost · Planned Cost · Remaining Target Cost Capacity · Projected Margin. Never "cost budget" or "cost envelope" — no internal stage cost budget is entered anywhere.

## Technical notes

- One additive migration: nullable `pm_tasks.notes`. Nothing else in the database changes.
- Planned allocation costs come from the same effective-rate helpers the project profitability screens already use, so stage and project figures agree; no profitability formula is rewritten.
- Untouched: `computePricing`, `cotaBoPorColabProjecto`, hybrid resource cost, `cost_rate`/`sale_rate`, quote snapshots, BO overhead.
- Planned allocation stays separate from logged timesheet hours; the existing actuals columns are left as they are.

## Validation

Walk the acceptance scenario in the preview: a €10,000 stage at €100/h average sale rate shows 100 h capacity; a 40 h task at €50/h cost shows €2,000 planned cost, €3,000 remaining capacity and an 80% projected margin; editing to 80 h moves only the delta; pushing past target shows the margin warning; deleting restores everything. Plus a TypeScript check and an i18n parity check.
