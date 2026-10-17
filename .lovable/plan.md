# Gantt fixes and CRM relative timeline

## Scope and approval boundary

The implementation is **partial, not complete**. The uploaded brief requires **plan first and stop for your OK**. Further implementation waits for approval.

Preserve the existing application, auth, permissions, integrations, live allocations, timesheets, cost snapshots and weekly-board behaviour. Every database change needs an identical source-controlled mirror under `supabase/migrations`.

## Root causes and fixes

### 1. Resources do not follow stage length
**Cause:** drag, date and dependency edits used different save paths; resource ranges, hours, costs and some fee displays remained stale.

**Fix:** use the shared atomic scheduler. Attached editable allocations adopt the new stage endpoints, preserving hours per day and metadata. Refresh allocation-derived hours, costs and fees; preserve manual/fixed fees and sold baselines. Undo/redo restores the affected state without overwriting unrelated edits.

### 2. Dependencies do not reschedule
**Cause:** deletion/replacement and cascades used inconsistent rules; stale parent dates disrupted propagation and configured lag hid additional gaps.

**Fix:** save links, successor dates and allocations together for FS/SS/FF/SF with signed working-day lag. Preserve duration, cascade downstream and reject circular links. Locked successors remain unchanged with visible discrepancies. Keep agreed defaults: deleting the last link retains position; latest incoming constraint wins, with extra gap shown separately.

### 3. Parent stages are not consistently summaries
**Cause:** some views used stored parent dates/budgets or direct allocations instead of descendant summaries.

**Fix:** derive earliest child start, latest child end and summed child hours/fees. Preserve WBS numbering; remove summaries from missing-allocation warnings and prevent new direct assignments. Never silently delete existing parent allocations or resurrect stale parent budgets when children total zero.

### 4. CRM relative planning and conversion
**Cause:** proposal editors used calendar dates; conversion inconsistently resolved holiday-aware dependencies, retainer percentages and monthly payment terms.

**Fix:** show Week 1… / Month 1… offsets and durations using five-day weeks, without holidays/leave. Existing proposals initialize only through explicit reviewed previews. Going live requires a start date and an authorized, preview-bound, all-or-nothing conversion preserving hierarchy, durations, dependencies, resources, fees, payments and integration links.

## Current verification — partial

- **Passed now:** 29 scheduling tests, 5 leaf-fee tests and 17 weekly-planning regressions; latest available application checks report no errors.
- **Fresh rollback checks:** 30% of €2,400 × 3 months resolves and copies as €2,160; monthly collection resolves and copies as 2026-10-31 with terms added once. No test records retained.
- **Passed earlier:** signed-in isolated two-save/two-undo/two-redo read-back; circular-link correction preview/cancel; €600 regular fee / €180 payment conversion and retry; three retainer months at 80h each; €4,500 monthly-estimate fallback.
- **Earlier preservation checks:** full-row hashes of 94 live allocations, 107 stages, 1,411 timesheet entries and 37 cost periods matched the baseline. Fresh final checks remain pending.
- **Partial corrections present:** milestone creation flag/date cascade, source-aware leaf/summary fees and duplicate-link/lag validation. Full browser verification and atomic milestone toggle/undo coverage remain pending.

## Work after approval

1. Review all insertion/date/duration/milestone paths for shared atomic saves and complete undo/redo.
2. Drag/edit stages on isolated copies; inspect allocation endpoints, hours/day, hours, costs, fees and undo/redo.
3. Exercise all dependency types with signed lag, holidays, chains, competing links, locks, cycles, deletion/recreation and the intermediate-stage FF reproduction; confirm browser/database validation parity.
4. Verify parent hours/fees and warnings across Gantt/Architecture, including source overrides and pricing changes.
5. Rerun conversion fixtures; verify complete preview/copy parity for supplier markups, retainers, monthly payments, hierarchy and integration links, including stale/failing/retried conversions.
6. Run regressions and translation parity; compare fresh live-record hashes and remove only test fixtures.

**Not yet verified:** complete browser drag flows, atomic milestone toggle/undo, full commercial/integration parity, all holiday-aware conversion dependency combinations and concurrent browser edits. No real proposal converted.

## Technical safeguards

Reuse the shared scheduler and existing financial/WBS helpers and EN/PT translations; add no packages. Keep server authorization, protected allocation checks, revisions and overlap locks authoritative. Bind conversion to the exact preview. Never invoke or alter weekly draft/publication operations.

## Approval checkpoint

Retain the agreed defaults. **Stop for Luis's OK**, then finish and report **fixed / verified / not verified**.