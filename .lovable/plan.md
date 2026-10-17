# Gantt fixes and CRM relative timeline

## Scope and protected records

Fix the three Gantt issues and add relative CRM planning within the existing application. Preserve its styling, routes, permissions and integrations. Do not change existing live allocations, timesheets, cost snapshots or weekly-board behaviour. Every database change must have an identical source-controlled migration under `supabase/migrations`.

Earlier implementation work is incomplete and not verified end-to-end; it must not be treated as a completed fix. No further application-code or database changes will be made before approval of this plan.

## Root causes and proposed fixes

### 1. Resources do not follow stage length

**Cause:** drag resizing, date/duration editing and dependency cascades use different update paths. Some proportionally scale allocation ranges; others only move them or leave them unchanged. Resource hours, costs and fees therefore retain stale ranges.

**Fix:** use one atomic scheduling operation for all those edits. Each attached editable leaf-stage allocation takes the stage's new start/end, preserving hours per day, percentages, snapshots and metadata. Recompute planned hours/cost and allocation-derived fees; preserve fixed/manual fees and sold commercial baselines. Undo/redo restores the complete affected stage, allocation and dependency state, rejecting stale history rather than overwriting another planner's edits.

### 2. Dependencies do not reschedule consistently

**Cause:** deletion does not recompute successors; link replacement uses separate writes; scheduling paths disagree on working-day duration, holidays and summary bounds. Labels show configured lag without showing additional gaps.

**Fix:** recompute on create, edit, delete and replacement, saving stages, allocations and links together. Support FS/SS/FF/SF and signed working-day lag; preserve inclusive working-day duration and cascade through successors. FS with zero lag starts on the next working day after the predecessor ends. Live planning excludes public holidays; CRM uses five-day planning weeks without holidays or personal leave.

Keep your settled defaults: after deleting the last link, retain the current position; with several incoming links, the latest constraint wins and each additional gap is shown separately. Locked successors remain in place with a visible discrepancy. Reject circular links and edits requiring changes to locked/imported allocations without partial writes.

### 3. Parent stages are not consistently summaries

**Cause:** some views roll up children only for display, while other editors and scheduling paths read stored parent dates or direct allocations. Warnings can treat parents as unallocated work stages.

**Fix:** use the same recursive hierarchy projection everywhere: earliest child start, latest child end, child hours and fees summed once. Preserve WBS order, exclude parents from missing-allocation warnings and prevent new direct resource assignments to summaries. Report any existing parent allocations rather than silently deleting them. Preserve retainer templates and billing-month behaviour.

### 4. CRM relative timeline and live conversion

**Cause:** proposal planning still relies on absolute date fields and calendar controls. Existing conversion copies related records through separate writes and defaults the project start to today.

**Fix:** explicitly store working-day offsets and durations for editable, unconverted proposals. Show Week 1… and Month 1… instead of dates, with offset/duration controls and no project-start date. One planning week is five days; one planning month is four weeks/20 days. Holidays and personal leave do not affect CRM effort.

Preview normalization before initializing an existing editable proposal, retain its original dates for compatibility, and never automatically rewrite locked or converted proposals. Retainer month counts remain real billing months.

At explicit live-project creation, require a real start date, snap it forward to a working day and preview the complete calendar conversion. Preserve hierarchy, durations, resources, hours/day, snapshots, dependencies, lags, commercial schedules and integration links. Create all related records in one authorized, idempotent transaction; retries must not create duplicates, and linked live projects must never be re-dated.

## Current implementation and remaining gaps

Partial scheduling and conversion work exists, but this request is not complete. Before enabling or claiming completion:

- Resolve the relative-preview failure on the South Perth proposal. Its existing summary-to-descendant link is detected as circular; show a clear blocking message and offer an explicit correction preview, never silently remove a live link.
- Verify undo/redo across several consecutive changes and fix history revisions if they prevent earlier actions being restored.
- Verify relative initialization, new-stage insertion and every editor actually use offsets; existing uninitialized proposals currently still show calendar dates.
- Complete exact commercial parity for conversion, including saved monthly-estimate fallback, supplier markups, percentage payments, retainer month effort, generated versus fixed payment dates, and previewed copied records.
- Verify holiday-aware dependency positions after conversion, rather than assuming mapping both endpoints always preserves signed lags.
- Validate retainer conversion with a fixture satisfying the existing retainer field requirements; the last fixture stopped at that validation before conversion.

**Verified so far:** 24 scheduling unit tests and 17 weekly-board regression tests; rolled-back basic conversion with a €600 fee and a 30% payment resolved to €180; idempotent retry; signed-in proposal rendering. Full-row hashes still match the original 94 allocations, 107 stages, 1,411 timesheet entries and 37 cost periods. Database changes made so far have source-controlled mirrors.

**Not verified:** complete browser save/undo flows on an isolated copy, the relative preview on the existing proposal, retainer conversion, full commercial/integration parity, and concurrent browser edits. No real proposal conversion or live schedule save was performed during these checks.

## Technical safeguards

- Reuse the shared Gantt, existing permission helpers, quote locks, financial calculations, WBS helpers and EN/PT translations; add no packages.
- Complete the unfinished scheduling integration before enabling it: verify authorization for existing planner scopes, safe read projections, server-side range/graph/lock validation and atomic writes.
- Serialize changes with an overlap lock and revision check, including undo/redo. Do not rely on browser checks for permissions or protected allocations.
- Relative planning must have explicit offsets/durations, not merely calendar headings renamed as weeks.
- Conversion must preserve every existing copy step inside the transaction, including retainer expansion, commercial baselines, payments and opportunity links.
- Do not invoke weekly draft/publication operations or rewrite weekly records.

## Verification after approval

1. Capture full-row hashes of existing allocations, stages, dependencies, timesheets, resource rates, cost periods and weekly records before testing. Confirm the reported 94-allocation baseline by current read-only count.
2. Run database permission, failure/rollback, overlap and stale-revision tests first; only then use an isolated, clearly labelled test copy for browser saves.
3. Shrink/extend by dragging and date/duration editing; verify exact resource endpoints, hours/day, effort, costs, fees, parent summaries and complete undo/redo. Check the Technical Design example: 7 March 2027 is Sunday and live dates must normalize visibly.
4. Test all four dependency types with positive, zero and negative lag, holiday crossings, chains, multiple constraints, locked successors, cycle rejection, delete/recreate and the intermediate-stage FF reproduction.
5. Verify CRM-relative controls and holiday-independent effort, then perform the full start-date preview and live conversion on the test copy only. Read back all dates, resources, links and commercial records; test failure and retry without duplicate projects.
6. Run scheduling/financial/conversion and existing weekly-board regressions, EN/PT parity and preview checks. Compare original full-row hashes and clean up only test fixtures.

## Approval checkpoint

No new decisions are needed: retain the previously agreed defaults. After approval, implement and report **fixed / verified / not verified**, explicitly identifying any verification limits. Stop here for Luis's approval.