# Gantt fixes and CRM relative timeline

## Scope and boundary

Fix resource resizing, dependency rescheduling and parent summaries in the existing Gantt; give CRM proposals a genuinely relative plan that becomes calendar-based only when a new live project is created.

No application code or database changes before Luis approves this plan. Implementation and verification must not alter existing live allocations, timesheets, rates, sold commercial baselines or weekly-board behaviour. The database currently contains **94 live allocations**; preserve their complete rows, not just that count.

## Root causes and fixes

### 1. Resource bars do not follow stage length

**Cause:** drag resizing proportionally scales resource dates, while date/duration edits deliberately skip resizing. Cascade saves only shift resource dates when both stage endpoints move by the same amount. Different editing paths therefore produce different resource ranges. Hours and costs are calculated from those ranges, so stale ranges retain stale totals. Gantt-wide undo is missing.

**Fix:** one scheduling operation for drag, date/duration edits and dependency changes. Every attached editable resource allocation takes its leaf stage's new start/end; preserve hours per day, percentages, rate snapshots and other metadata. Recalculate planned hours/cost and allocation-derived fee consistently. Preserve intentionally fixed/manual fees and sold live-project baselines; show revised planned sale separately where applicable. Undo/redo restores the whole affected schedule change, including cascaded stages, allocations and links—not the weekly-board history.

### 2. Dependencies do not consistently reschedule

**Cause:** deletion only removes the link and refreshes links; it does not recompute the successor. Drag replacement deletes then creates in separate requests. Several rescheduling implementations disagree about parent bounds, lock handling and allocation updates. Duration is preserved as a calendar span even though lag uses weekdays; public holidays are not included in that helper. Link labels show configured lag, not additional slack. Database cycle checks already exist, but the UI does not consistently preserve the old link and explain rejection.

**Fix:** recompute the affected graph after create, type/lag edit, deletion and replacement, using one scheduling engine and one atomic save. Resolve parent bounds from children throughout the calculation. Validate cycles before saving and retain database cycle protection. Reject circular or incompatible summary/child relationships with a clear message and no partial writes.

**Your resolved choices:**
- After deletion, use the rules still defined in that stage's dependency box. If there are none, leave the stage at its current position. The dependency box and drawn links must represent the same rules; no hidden second offset.
- With several incoming links, the latest required start wins. Show each link's configured lag and any additional gap caused by another constraint separately.

**Scheduling defaults:**
- FS zero lag means the next working day after predecessor finish; SS aligns starts, FF aligns finishes, SF aligns successor finish to predecessor start. Positive/negative lag uses the same working-day arithmetic everywhere.
- Preserve inclusive working-day duration when cascading. CRM uses Monday–Friday equivalent planning units without actual holidays/leave; live calendars exclude public holidays as well as weekends. Personal leave remains a capacity warning, not a stage-calendar constraint.
- Never move a locked stage or modify an imported/locked allocation. If a requested edit requires that, reject the complete edit and identify the protected item. A locked successor keeps its position and shows its constraint discrepancy. Existing quote locks and permission checks remain authoritative.

### 3. Parent stages are not consistently treated as summaries

**Cause:** the Gantt already rolls up some parent dates/budgets for display, but other editors and scheduling paths read persisted parent dates. Missing-allocation warnings check direct allocations on every stage, including parents. Hours and fee calculations do not all share the same hierarchy projection.

**Fix:** parents with children consistently display earliest child start, latest child end and child hours/fees summed once, using existing WBS ordering. Use that same projection for inspector, dependencies and totals. Exclude parents from the missing-allocation warning and prevent direct resource assignments to summaries. Do not silently delete or move any existing parent allocations; report legacy exceptions before handling them. Preserve the dedicated retainer-template/monthly-child behaviour and avoid double counting.

### 4. CRM relative timeline and conversion

**Current limitation:** quote stages and allocations store calendar dates, the Gantt derives a calendar project start, and bootstrap uses a date input. Creating a project currently sets its start to today and copies quote dates through multiple separate writes; there is no true offset/duration model or holiday-aware conversion.

**Fix:** unconverted editable CRM plans use Week 1, Week 2… and Month 1, Month 2…; replace calendar date controls with offsets/durations and remove the CRM “Project start” date. Store relative scheduling explicitly, not just renamed calendar headings. No actual holidays or leave affect CRM positions or estimates.

**Proposed defaults:**
- A relative week is five planning working days; a relative month is four planning weeks (20 working days), clearly distinguished from calendar months. Internally keep working-day offsets/durations so partial-week stages and signed lags remain precise.
- Existing editable, unconverted quotes retain their original date fields for compatibility. Initialize their relative plan from their current weekday spacing/durations, preserving hierarchy, resource effort and dependency rules; show the normalized result before the first save. Do not rewrite locked/sent/approved or already converted proposals automatically. Their existing revision workflow provides the editable version.
- Retainer commercial month counts remain actual billing-month counts, not 20-day planning months. Preserve recurring fees and monthly expansion, with their real anchor selected at conversion rather than showing a CRM calendar date.
- Reuse the existing approved/won → project workflow; do not auto-create projects when a deal changes status. At explicit project creation, require and preview the real start date (snap forward if non-working). Map relative offsets/durations to working dates using public holidays, then resolve dependencies with the same rules. Preserve planned resource hours/day and commercial snapshots; existing live projects remain calendar-based.
- Show the exact conversion preview: start/end dates, hierarchy, resources, effort, links/lags and retainer months. Create the new project and its related rows atomically and idempotently, preventing half-created or duplicate projects. Never re-date an already linked live project.

## Technical approach

- Reuse the current shared Gantt, planner adapters, permission/quote-lock systems, financial helpers, WBS numbering and EN/PT translations; no new framework or packages.
- Consolidate only scheduling paths needed for these fixes. Core evidence: `gantt-chart.tsx`, `use-planner.ts`, `use-quote-planner.ts`, `cascade-from-predecessor.ts`, `reflow-schedule.ts`, `dependencies.ts`, `quote-warnings.ts`, `build-project-gantt-tree.ts`, and the quote-to-project action in `_app.crm.quotes.$quoteId.tsx`.
- Additive storage for relative schedules and narrow authenticated atomic scheduling/conversion operations, with appropriate grants/RLS and server-side authorization. Preserve legacy columns and integration links.
- Serialize each schedule mutation; check a revision token before saving or undoing so another planner's newer changes are not overwritten. Stages, resource dates and dependency edits succeed together or change nothing.
- Gantt changes must not call weekly publication/draft functions or change their rules. Weekly data becomes stale through its existing revision checks when genuine future Gantt edits occur; no weekly records are rewritten by these fixes.
- Every database change gets its exact source-controlled mirror in `supabase/migrations`. Record structural rules in `AGENTS.md` and user-facing rules in project memory.

## Verification after approval

1. Capture complete-row hashes of all 94 existing allocations, stages, timesheets, rates and weekly-plan/publication records. Use an isolated, clearly named test copy only; database cases run in rollback fixtures before any browser saves to the copy.
2. Shrink and extend by dragging and editing dates, including the Technical Design end-date example (7 March 2027 is Sunday: live mode must visibly normalize to a working day). Check exact resource endpoints, unchanged hours/day/rates, planned hours, costs, allocation-derived fee, parents and undo/redo.
3. Test FS/SS/FF/SF with zero, positive and negative working-day lag; holiday crossings, multiple constraints/slack, locks, cascaded chains, cycle rejection and delete/recreate. Reproduce the intermediate-stage FF sequence specifically.
4. Verify parent summaries and warnings, nested WBS order, no duplicated totals, and retained retainer behaviour.
5. In the browser, verify CRM relative headings/controls and holiday-independent effort; create a new live project from the test copy through the real start-date preview and confirm dates, effort, links, lags and commercial snapshots read back correctly. Test retry/failure rollback without creating duplicates.
6. Run focused scheduling/financial/conversion regression tests and existing weekly-board tests, EN/PT parity and preview diagnostics. Compare original complete-row hashes afterward; remove only isolated test fixtures.

## Approval checkpoint

**Investigated:** the conflicting resize paths, deletion without rescheduling, existing cycle guards, parent-warning error, absolute-date CRM storage and conversion path; read-only count confirms 94 allocations.

**Not fixed or verified yet:** no implementation, test-copy reproduction or conversion has been performed. After approval, report **fixed / verified / not verified**, including any untested real-user concurrency or protected-data cases. Stop here for Luis's OK.