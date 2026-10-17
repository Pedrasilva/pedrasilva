# Gantt fixes and CRM relative timeline

## Scope and approval boundary

Complete the requested Gantt fixes within the existing application, preserving styling, routes, authentication, permissions and integrations. Your re-uploaded brief says **plan first and stop for your OK**; no further application or database changes will be made until approval.

Keep existing live allocations, timesheets, cost snapshots and weekly-board behaviour unchanged. Every database change must have an identical source-controlled mirror under `supabase/migrations`.

## Root causes and fixes

### 1. Resources do not follow stage length

**Cause:** dragging, date editing and dependency movement previously followed different save paths, leaving resource ranges and their calculated hours/costs stale.

**Fix:** route these changes through the shared atomic scheduler. Every editable allocation attached to a leaf stage adopts its new start/end while preserving hours per day and metadata. Refresh planned hours, costs and allocation-derived fees; preserve fixed/manual fees and sold baselines. Undo/redo restores affected dates and links without overwriting another planner’s changes.

### 2. Dependencies do not reschedule

**Cause:** deletion/replacement and date cascades used inconsistent rules; stale summary dates could prevent convergence, and configured lag did not reveal extra gaps.

**Fix:** save links, successor dates and resources together for FS/SS/FF/SF with positive or negative working-day lag. Preserve duration, cascade through successors and reject circular links. Locked successors remain unchanged with a visible discrepancy. After deleting the last link, keep the current position; with multiple links, the latest constraint wins and extra gaps are displayed separately.

### 3. Parent stages are not consistently summaries

**Cause:** some paths used stored parent dates or direct allocations rather than recursive child summaries.

**Fix:** derive earliest child start, latest child end and summed child hours/fees; preserve WBS numbering, remove summaries from missing-allocation warnings and prevent new direct assignments to them. Do not delete existing parent allocations silently.

### 4. CRM relative planning and live conversion

**Cause:** proposal editors used calendar dates; conversion did not consistently re-evaluate holiday-aware dependencies or copy resolved commercial/payment values.

**Fix:** use explicit offsets/durations, Week 1… and Month 1… controls, with five-day planning weeks and no holidays/leave. Existing proposals initialize only through an explicit reviewed preview. Live conversion requires a start date and a preview-bound, authorized, all-or-nothing transaction that preserves durations, dependencies, resources, commercial records and integration links.

## Current results — partial, not complete

- **Verified:** 27 scheduling tests and 17 weekly-planning regressions; translation parity; current application checks pass.
- **Verified in the signed-in browser:** existing proposal’s circular-link correction preview opens and cancellation writes nothing; an isolated proposal accepted two saves, two undos and two redos, and the restored plan rendered after reopening. The test copy was deleted.
- **Verified in rollback-only checks:** regular conversion resolves a €600 fee and €180 percentage payment, with idempotent retry; retainer conversion copies three months with 80 hours per month; saved monthly-estimate fallback resolves €1,500 × 3 = €4,500.
- **Preserved:** full-row hashes of all 94 live allocations, 107 stages, 1,411 timesheet entries and 37 cost periods still match the baseline. No test proposal remains. Applied changes have exact migration mirrors.

### Remaining fixes identified in review

1. Retainer stage-based percentage payments must use the complete monthly fee × month count, not a single allocation-period fee.
2. Monthly payment conversion must derive collection from the mapped invoice date and add payment terms once; otherwise crossing a month can add an extra month.
3. Verify all relative insertion/editor paths, summary fee/warning paths, and compatibility between browser and database graph validation.

## Verification after approval

1. Add rollback tests for both remaining payment defects, fix them and confirm preview/copy parity.
2. On isolated copies, exercise dragging and date/duration edits with resource endpoints, hours/day, hours, costs and fees; check parent summaries and undo/redo.
3. Exercise all dependency types with signed lag, holiday crossings, chains, competing links, locks, cycle rejection, deletion/recreation and the intermediate-stage FF reproduction.
4. Verify complete conversion preview and copied records, including supplier markups, retainers, monthly payments, hierarchy and integration links; test stale/failing/retried conversions.
5. Run existing regressions, compare live-record hashes and remove only test fixtures.

**Not yet verified:** complete drag-through-browser flows, full commercial/integration parity, all conversion dependency combinations, and concurrent browser edits. No real proposal was converted.

## Technical safeguards

- Reuse the shared scheduler and atomic save operation, existing financial/WBS helpers and EN/PT translations; add no packages.
- Keep server-side authorization, protected allocation checks, revisions and overlap locks authoritative.
- Preserve all existing conversion copy steps and bind approval to the exact previewed inputs.
- Do not invoke or alter weekly draft/publication operations.

## Approval checkpoint

No new decisions are needed; retain the previously agreed defaults. **Stop here for Luis’s OK**, then complete the remaining fixes and report **fixed / verified / not verified**.