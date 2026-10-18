# Gantt — planned versus actual

## Scope and approval
Add a read-only actuals layer to the live-project Gantt, using the existing layout, scheduling controls, permissions and calendar. No code or database changes until Luis approves. No changes to timesheets, cost snapshots, allocations, dates, commercial baselines, CRM proposal Gantt or weekly-board behaviour.

## 1. Weekly trail on each person's stage row
- Add a thin weekly strip beneath the planned bar, anchored to real entry dates, with one consistent intensity scale across the project: darker means more logged hours.
- Tooltip: week dates, logged hours, planned hours and **difference = logged − planned**. Sum every separate activity without merging stored entries; include billable and non-billable project hours.
- Attribute actuals to the person who logged them, never proportionally to the planned team. Multiple bookings for the same person/stage must not repeat the same actuals strip or totals.
- Mark entries on days outside that person's planned date ranges, even when part of the same week lies inside a booking. Extend the visible timeline to include those real dates; never extend the allocation itself.
- Show a person with actuals but no allocation under that stage as **“Não planeado”**, with planned hours = 0. Preserve visibility for inactive collaborators and retired planning bookings with historical hours.
- Keep leave warnings separate: existing **−8h / −208h** are unavailable contractual hours, not logged-minus-planned differences.

## 2. Stage budget and hours
When actuals are visible, display the same figures on the stage bar and in the left outline:

**Stage fee · cost to date · remaining € · planned h / logged h · % budget consumed**

- Budget is the saved stage fee, not resource sale value or a target-cost envelope.
- Timesheet cost to date = sum of logged hours × each entry's saved cost snapshot, through today. Never recalculate using current salaries or team averages.
- Remaining = fee − cost to date; negative values remain visible.
- Planned hours come from live planning allocations and the shared working-day calendar. Preserve explicit percentages where supported; retired bookings do not count as current planning. Zero-hour assignments remain zero.
- Keep **≈60h** as a separately labelled fee-derived effort estimate when no hours are allocated; never manufacture weekly planned hours from it.
- Consumed percentage = cost ÷ fee × 100, without clamping the displayed number. With no positive fee, show percentage as unavailable; a positive cost on a zero fee is still over budget.
- Colours: **red** when cost > fee; otherwise **amber** only when consumed % is **more than 10 percentage points** ahead of elapsed %; otherwise **green**. Red takes priority. Missing costs produce an incomplete-data warning, not a reassuring green status or invented cost.
- Elapsed % reuses the existing schedule elapsed calculation: calendar-date fraction from stage start to end, clamped to 0–100. Missing/invalid dates cannot trigger the elapsed-time amber rule.
- Replace the thin planned-cost line with actual budget consumption while this mode is on. Preserve the existing planned-cost line when it is off; do not describe either as physical completion.
- Compact two-line outline metrics and tooltips/popovers for full detail; narrow bars may carry a short summary, but every requested figure remains available without overlapping neighbouring bars.

## 3. Parents and project row
- Sum child fees, planned hours, logged hours and costs recursively once; compute remaining and consumed % from those sums, never average child percentages.
- Parent dates use earliest child start and latest child end, matching the existing Gantt summary rule.
- Do not add a saved parent fee on top of its children's fees. BCG F5 stores €25,500 on the parent and €20,291 on its children: the proposed child rollup is €20,291, not their combined €45,791.
- Preserve actuals genuinely linked directly to a parent as a separate direct contribution, added once alongside child actuals. BCG has 29h / €989.77 directly on F5 Construction: those hours must not disappear when the parent becomes a summary or be guessed into monthly children.
- Project-only historical entries with no stage remain a clearly separate project contribution, not guessed into children. Entries lacking an identifiable person remain explicitly unattributed, not assigned to another collaborator.
- This is a stage-fee versus timesheet-labour view; do not change report-specific own-work/supplier-margin definitions or add expenses/purchases/pursuit costs into it.

## 4. Toggle and access
- Add **“Mostrar horas registadas”**, initially off. Off preserves the clean current plan; on reveals trails, actual-versus-plan tooltips and budget metrics.
- Use existing project/timesheet access for hour visibility and existing scoped financial permission for euros and cost-derived percentages/alerts. No new access grants and no raw salary data.
- Reuse existing EN/PT glossary and shared translation keys; add new EN/PT keys together.

## Figures to reuse or replace
**Reuse:** saved stage fees; holiday/closure-aware allocation-hour calculations; approved-leave warnings; WBS ordering and summary date spans; locked timesheet snapshots; the existing stage-level actual sums where the entries are complete; shared schedule elapsed helper; existing permissions and UI controls.

**Replace in the new mode:** planned €4,856 as if it were cost to date; planned-cost progress line as if it were actual progress; proportional per-allocation actuals (not evidence of what each person logged); parent-plus-child fee totals. Retain fee-derived hours only as explicitly separate estimates.

**BCG reconciliation baseline:** F3 has 144 planned hours versus 362.68 logged hours, cost €12,219.6818, fee €129,050, remaining €116,830.3182 and 9.47% consumed. All 58 F3 entries have snapshots; it is green under the requested rule because its schedule has ended and cost is below fee. These are read-only observations, not test edits.

## Technical approach
- Add a focused project-scoped read hook and pure aggregation helpers, extending existing shared actuals logic where safe rather than changing unrelated reports.
- Load all pages and propagate errors; current budget-control queries are not paginated, do not read person/date for their aggregate, and follow only task-linked project entries. Include direct `pm_stage_id` entries and retain task joins to planning-removed allocations for actuals. Deduplicate each entry by ID.
- Existing `useStageBudgetControl` has correct snapshot sums for BCG but its allocation actuals are proportional estimates and must not power the trail. Avoid its current-rate fallback for missing snapshots in this mode.
- Historical stage/person/date mappings and stored import costs can be reused where present, labelled as imported rather than timesheet snapshots; preserve import deduplication and never invent missing links or costs. BCG currently has no historical or direct-stage entries, so its baseline comes entirely from task-linked timesheets.
- No new package or persisted actuals/heatmap storage is planned. Any unavoidable database change must be proposed explicitly and mirrored exactly in source-controlled migrations.

## Verification after approval only
- Unit tests: real-person attribution; task/direct linkage and deduplication; weekly boundaries; outside-date markings; unallocated/inactive people; zero-hour assignments; explicit planning hours; historical attribution; snapshot-only cost and incomplete-cost handling; parent direct actuals; no parent fee double-count; totals and time elapsed.
- Threshold tests: exactly 10 points ahead is not amber; more than 10 is amber; cost equal to fee is not red; cost above fee is red and overrides amber.
- One signed-in end-to-end check on an isolated copy of BCG data, then remove the copy: toggle, trails/tooltips, unplanned row, parents/project totals, zoom and narrow layout. Compare copied timesheets/snapshots before and after; no real project or proposal is used for test writes.
- Confirm scheduling/Undo and weekly-board regressions remain unchanged, translations stay in parity and no costs appear for people without financial access.

**Approval checkpoint:** stop here; implementation and its verification wait for Luis's OK.