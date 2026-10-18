# Weekly Timesheet Approval, Week Closure & Hours Bank

## Current request — relative payment descriptions
- [ ] Normalize dates in saved/frozen descriptions in both payment block renderers; verify an old-description snapshot displays only relative weeks.
- [x] Replaced placeholder calendar dates in all generated payment descriptions (including grouped invoices) with relative week labels. Signed-in, write-blocked browser check and screenshot confirmed Week 1–25 without calendar dates; no saved dates or amounts changed, no browser errors, build OK.

## Current request — conflicting proposal fees
- [x] Traced €109,000 agreed fees, €119,900 additive advance, older €114,620 composer payments and inconsistent VAT exemption.
- [x] Corrected 2675's nine planned rows to €109,000 (advance €10,900 + 90% stage invoices), VAT zero, deduction enabled; all stage rows/hours/dates/statuses and unrelated quote fields verified unchanged. Shared composer amount/fee helpers and cache invalidation aligned; 14 tests and build pass.
- [x] Signed-in write-blocked browser copy showed matching Financial and document totals, then read back corrected saved rows; no persisted test copy. Explain differences in final response.
- Source audit: docs/2675-proportional-advance-data.sql records the scoped correction; platform rejects direct migration-file creation for data-only corrections (no schema migration applied).

## Current request — planning cut-off approved and applied
- [x] Implement deterministic own-task provisioning with existing access, retired 0h missing links and no merging; copy-only database cases passed including non-planner 19 October logging, month/lock/cost preservation and cutoff/undo.
- [x] Browser save/read after reload on persisted disposable copy as Luis: 1h15 on 19 October, retired 0h link, pending approval and snapshot verified; copy/activity removed. Non-planner check used database claims, not another person's browser session.
- [x] 60 focused regressions passed; clean preview build; migrations mirrored.
- [x] Prepared durable snapshot c34e66f5-5b87-4e19-b10d-8267cedd831c, 15 trim / 0 retire / 79 untouched, all removed planned hours 0; 3 October retainer links included, 7 CTT exceptions listed.
- [x] Final plan approval received; atomically shortened exactly 15 allocations to 16 October. Verified all other fields except audit timestamp unchanged and reconstructed full revision matches pre-cutoff across all allocations/stages/tasks/linked entries/holidays/publications. 79 allocations including 7 CTT exceptions untouched; no week approved. Snapshot remains available for guarded one-step undo.

## Current request — approved selective recovery and deletion safety
- [x] Compared 04:00 backup with all FK references and relevant columns: forecast/activity dependents were empty in backup and live; no additional lost rows.
- [x] Restored 448 exact rows atomically through one-shot admin function; existing triggers restored, FK constraints retained, full row equality and unchanged non-target hashes across 219 public tables confirmed. Recovery function disabled afterwards; all migrations mirrored.
- [x] Signed-in browser read-back verified 34 allocations,34 tasks,380 entries,1786.24h and 23 person/project totals. Project costs/hours derive live from restored rows; approved hours-bank movements and week snapshots remained unchanged, so no re-approval or ledger rewrite was needed.
- [x] Database guards block task/allocation/stage/project deletion with history regardless of caller visibility; allocation removal retires. Rollback-only disposable-copy tests passed four blocked deletes, retirement preservation and empty deletes; no copies remained.

## Current request — Gantt planned vs actual (plan first)
- [x] Read-only BCG screen and stored-data inspection: explain planned cost/fee/hours, leave badges, implied hours and planned-cost line.
- [x] Prepare weekly per-person actuals and stage-budget proposal; identify reused/replaced figures and double-counting risks.
- [x] Plan approved; implement opt-in read-only actuals layer without changing stored hours, costs or planning.
- [x] 93 tests and EN/PT parity pass; signed-in disposable browser-copy verified F3 144h / 362.68h / €12,219.68, F5 direct-parent 29h and child-only €20,291 fee, weekly outside-date tooltip, 60 trails, zoom and off/on. No data writes.
- Verification limits: copy was browser-only, not persisted; full permission-matrix and a real retainer copy were not tested. Narrow project shell retains existing limitations; no unrelated shell changes.

## Current request — homepage and menu weekly planning
- [x] Compact personal approved Mon–Fri AM/PM plan, numbered stages, HR/calendar days and current-week team link for all PSA staff; private revision drafts never shown as personal planning.
- [x] Planner-only next-week status/action and staff-visible Projects weekly-planning menu across rail, tabs and mobile; existing Projects access gates unchanged.
- [x] 48 unit/regression tests and EN/PT parity passed. Signed-in browser verified a disposable in-memory copy of real June project/board data: ten AM/PM slots, calendar days, unapproved empty state, both week links and View As read-only menu/tools. No database writes or real approvals. Card fits 390px; unrelated existing whole-homepage overflow remains outside scope. Genuine non-planner account not impersonated; existing View As mode checked.

## Current request — first real weekly use prerequisites
- [x] Rita Costa was already archived in HR since 16 May; deactivated her still-active planning resource, preserving HR history and bookings. Board read-back excludes her.
- [x] Approved Ricardo Conceição's 27 October leave through the existing HR approval button; weekly board read-back shows Tuesday leave and reduced capacity.
- [ ] Weekly draft, preview and approval await Luis's person/project/day assignments; do not invent the plan.

## Current request — visible assignments and safe first approval
- [x] Show zero-hour assignments and parent-stage warnings on board/Gantt without changing existing bookings.
- [x] List every removed/changed allocation and enforce extra approval acknowledgement in UI and locked database apply; block new parent-stage bookings while preserving legacy assignments and outside-week splits.
- [x] 37 focused tests and 11 rollback safeguard assertions passed; signed-in Rita/Mastercard copy showed five daily markers and the red changed-booking preview with extra confirmation. Copy and draft deleted; 16 original zero-hour bookings preserved; exact migration mirrored and preview build OK. No real week approved.

## Current request — approved financial security fixes
- [x] Address security-test review: PASS is inside DO after all assertions, both creator roles checked, shared company master data explained; disposable fixture rerun fails correctly on supabase_admin defaults, no PASS emitted.
- [x] Compare current and proposed financial reads for every account: only Teresa loses PSA tax-history access; no PSA collaborator loses access.
- [x] Tighten the three approved SELECT policies while preserving intended PSA access and administrator oversight; exact migration mirrored.
- [x] Public-table TRUNCATE and postgres defaults revoked; Luis accepted leaving platform-owned supabase_admin defaults unchanged. Every future public-table creation must revoke client TRUNCATE explicitly; test checks all public tables regardless of creator and postgres defaults.
- [x] Revised test rerun passed all 15 admin/PSA-finance/non-PSA row checks, no public-table client TRUNCATE grants and postgres-default assertions; platform-owned defaults excluded as accepted. All disposable fixtures rolled back; no real project/proposal writes.

## Current request — CRM zero-quote fallback and atomic milestones
- [x] Use estimated fee labelled Estimated when the active quoted total is zero or empty, consistently across cards and totals.
- [x] Scope confirmed: milestone dates/dragging only. Single-stage drags now explicitly use the same atomic moveStages save as multi-stage moves; typed dates retain the existing atomic cascade.
- [x] 23 focused unit tests passed. Signed-in temporary copy verified one atomic milestone/successor save and Undo read-back, then deleted; no database function changes.
- Verification limit: drag gesture/Undo button not exercised because the minimal project copy's Architecture view requires a linked quote; actual shared save/Undo tested from the signed-in browser instead.

## Current request — preserve quoted effort and fees on conversion
- [x] Inspect current rules: ordinary stages/allocations extend around the live calendar; quoted commercial totals are copied.
- [x] Approval checkpoint: add explicit conversion date shifts and effort/fee comparisons; Christmas-closure unit and rollback tests.
- [x] Approved: preview baseline vs live dates, working days, hours, stage fees; Christmas unit + rollback SQL test; one on-screen check.
- [x] Save confirmed 2027 holidays (no Carnaval).

## Current request — Gantt fixes and CRM relative timeline (plan first)
- [x] Luis's 16:25 UTC instruction: stop after the current run; report done / remaining issues / recommendation in at most eight lines. No new work, re-planning or extra verification until he replies.
- [x] Review the latest re-uploaded brief; present root causes, partial implementation status and remaining verification gaps.
- [ ] Await Luis’s approval of the renewed plan before further code or database changes.
- [ ] After approval only: complete retainer-percentage and monthly-payment date corrections, then finish isolated drag/dependency/conversion parity verification; preserve live records and weekly-board behaviour.
- [ ] Report fixed / verified / not verified; mirror every database change under supabase/migrations.
- Verified partial work: 29 scheduler tests, 5 leaf-fee tests and 17 weekly regressions; earlier signed-in isolated two-save/two-undo/two-redo read-back. Fresh rollback checks confirm €2,160 retainer payment and 2026-10-31 monthly collection preview/copy. Earlier regular/retainer conversion and fallback passed; fresh final live-record hashes and complete browser verification remain pending. Re-uploaded plan-first brief renews the approval checkpoint.

## Completed request — Tatiana absence corrections and weekly approval
- [x] Audited and removed Tatiana's 8h July 22 and 16h August 19; both recorded as approved full-day unpaid absences. Luis also authorized removing stale Vacation August 17–18 and adding Vacation August 24–27; working rows retained.
- [x] Approved all 20 Monday-start weeks June 1–October 12 and reconciled bank in one transaction, after rollback verification. Bank 0h → −40h: June 22 −4h, July 20 −8h, August 17 −8h, October 12 −20h. Each new absence contributes exactly 8h owed.
- [x] Five full removed rows audited as Luis with exact reason, 2026-10-17 14:59:44 UTC; costs removed €226.88 (two working entries), Vacation rows had no cost snapshot. Committed read-back confirms approvals, absences, audit and balance. Full-row comparison preserved unrelated entries/weeks/leave/banks, all resource rates, 37 cost periods and 94 allocations; no schema change or full rebuild/recalculate. Browser display/email delivery not verified.

## Completed request — attendance reconciliation
- [x] Add service-only audited admin correction safeguard preserving every timesheet row; pending sick leave can lack attachment, approval cannot.
- [x] Apply exactly six corrections in one transaction; four days skipped because logged hours meet/exceed expected hours.
- [x] Rollback fixture, certificate guard and non-admin rejection verified; all 1,410 timesheet rows and unrelated leave/bank rows unchanged. No affected approved weeks or weekly ledger movements exist, so no bank recalculation applies.
- [x] Exact migration mirrored under supabase/migrations; read-back verified. Patricia's certificate upload and later approval remain pending her certificate.

## Current request — approved Stage 3 implementation
- [x] Luis accepted decisions 1–8 and Tatiana-first sequencing.
- [x] Complete and verify Tatiana's isolated costing milestone first.
- [x] Implement atomic preview/publication, stage extensions, revision drafting and transactional bells exactly as approved.
- [x] Rollback verification and browser preview; preserve full rows of all 94 allocations, stage dates and actual hours; report verification limits.

## Completed authorized request — Tatiana internal costing
- [x] Implement salary-derived Backoffice cost without Backoffice share; retain her salary in Projecto overhead and report internal costs only as overhead analysis.
- [x] Backfill only Tatiana's 108 internal entries (720h, expected €10,117.20), verify before/after and unchanged 37 periods/all other entries. Authorized before Stage 3; no full Rebuild/Recalculate.

- Verification limits (Stage 3): no real week approved; authorized browser preview and discard only. Database transaction fixture covers 13 checks, plus independent overlap-lock rejection. No two-planner browser race or browser confirmation committed.

## Current request — retainer actuals and safe cost rebuild
- [x] Removed retainer cost estimates across task/direct/resource-detail paths; signed-in 0410B shows 335h / €11,569 and 0434 shows 20h (20.25 exact) / €750. Browser-only missing-snapshot responses show dashes and red warnings; no page errors. Seven regression tests passed.
- [x] Atomic service-only replacement and queue acknowledgement with shared transaction lock/revision; interrupted insert and successful forced rollback preserve full 37-row hash and entries/queue; a second session's attempt was rejected under a held lock. Exact migration mirrored. No committed rebuild/backfill/recalculate or timesheet/rate changes.
- [x] Tatiana proposal only: manual override or own-salary-only Backoffice rates with internal costs excluded from overhead-loaded project totals. Read-only hypothetical 108-entry / 720h backfill: 7 entries (56h) at €12.53, 101 (664h) at €14.18; €10,117.20. Subsequently completed the explicitly authorized scoped backfill: all 108 now have salary-only snapshots; all other entries and 37 periods unchanged.
- Verification limits: no real rebuild button or scheduled endpoint invoked; interruption tested as insertion failure after deletion, not worker/network termination. Source computation happens before the atomic locked write; stale period revisions are rejected. Tatiana costing/report aggregation subsequently implemented with regression tests.

## Current request — Stage 2 hardening
- [x] Narrow weekly-table grants, staff RLS boundary, immutable approved rows, slot audit trigger, validated private notes and stage dates; exact migration mirrored.
- [x] Deliberate brushes, banner errors/saved-draft reload, per-day stage choices, whole-stroke undo, extension ranges/server merge/deduplication, stage-only details and permanent dropped bookings.
- [x] Rollback access/guard/RPC tests and distinct approved-leave check passed; 26 unit tests, i18n and signed-in Gantt/empty/previous sources, painting/undo/recovery/extensions/details passed. No test drafts remain. Grant origin is live global postgres default privileges; sandbox_exec is platform sandbox tooling, unchanged. No Stage 3, allocation, stage-date, timesheet or cost writes.
- Verification limits: no genuine non-planner/nonstaff browser session; database checks use their real identities under authenticated role. Mixed candidate-day behavior unit-tested; no two-planner browser race or Stage 3 approval tested.

## Current request — targeted operational fixes
- [x] Weekly bell events verified in rollback; labeled 10-minute-old notification sent through real email path. Inbox receipt not independently confirmed.
- [x] Retainer missing-cost helper tests and real Telheiras totals verified; no missing retainer snapshots, no rebuild required.
- [x] Press-kit client-approval/internal-only/never-name checks and approval rejection verified in rollback.
- [x] Bank-derived confirmation persists matching account on queue/document in rollback; finance browser route redirects, so UI end-to-end remains unverified.
- [x] Inventory rules unchanged; all write entry points hidden. Editor screen and simulated no-edit screen verified; genuine non-editor session unverified.
- [x] Model usage/catalog reviewed without replacements; current in-use IDs are not marked deprecated. Report verification limits.

## Current request — weekly planning Stage 2
- [x] Mirror Stage 1 database objects and verify non-planner/non-staff access.
- [x] Add atomic draft creation/discard and planner-only slot autosave with conflict handling.
- [x] Build painting, stage resolution, undo/redo, comparison, notices and EN/PT.
- [x] Signed-in draft sources, painting, drag, whole week, erase, site visits, undo/redo, stage choice, null-stage notices, extension intentions, reload, comparison and discard verified; concurrency, leave/weekend rejection and failed-save retry verified. Test drafts removed. Stage 3 untouched.

## Current request — weekly planning Stage 1
- [x] Add additive allocation fields, protected week-plan tables and staff-only no-rates read RPC.
- [x] Build/test slot derivation and read-only person/project weekly board, navigation and EN/PT.
- [x] Signed-in board tested with real June allocations: both views, own-row highlight, leave denominator, no-rates response, colour controls, week navigation and 390px scroll; 13 rules, 7 pursuit tests, financial tests, translations and preview pass. All 94 allocations untouched. Stop before Stage 2.
- [x] Non-planner staff board and direct draft RLS verified in Stage 2: no drafts/brush, no financial fields; non-staff board refused and draft table reads return no rows.

## Current request — pursuit follow-up
- [x] Align calendar assignment choices and assistant wording with available pursuit leads; transcription had no outdated phrasing.
- [x] Export seven current live pursuit functions, trigger, column/backfill, FK and index; apply and mirror the migration with live grants retained.
- [x] Signed-in calendar excludes Office project and offers Uralchem IV; real assistant drafts 2h on Cabo Verde and Uralchem IV with exact IDs; all 24 directory rows unchanged; rolled-back live lost-deal insert rejected; 7 tests, i18n and preview checks pass. Existing lost-row display covered by helper test (no live lost deals); microphone recording not retested.

## Current request — pursuit choices
- [x] Add log-hours flag, compatible directory eligibility and allow won hours while blocking lost; 3 open deals backfilled.
- [x] Update timesheet/voice choices and CRM controls with EN/PT translations.
- [x] Verify switch persistence, on/off search, won save/read-back and active-linked exclusion; 6 rule tests and i18n pass. Temporary time entry audited and removed. Existing cost RPC and calendar/report consumers unchanged; no live project relinking or voice recording performed.

## Done
- Schema: `pm_timesheet_weeks`, `pm_hours_bank_entries` (RLS, audit fields, lock trigger, one additional-hours row per week).
- Capacity resolver from existing HR contract fields (daily hours x days per week) — never hardcoded 40h.
- Week totals kept separate: project / internal / leave / working / accounted; only working hours compared to capacity.
- My Week card on `/projects/timesheet` with submit + confirmation; submitted/approved weeks lock editing.
- `/projects/weekly-approval`: week navigation, completion/approval/exception stats, filters, roster table,
  review panel with breakdown, explicit additional-hours acknowledgement (capped at calculated excess),
  approve / return / reopen with reconciliation of the ledger row.
- Hours bank panel: ledger with running balance, compensation into leave (creates a pending
  `autorizada_paga` request with provenance in the notes), paid compensation, manual adjustment with reason.
  Shown on the collaborator profile (manage) and on My sheet (read-only).
- Navigation entries under Projects and Time. EN + PT-PT translations. Typecheck + i18n parity pass.

## Open / needs live data
- Submit -> approve -> reopen -> re-approve was not exercised against production rows (would mutate real data);
  verify with a real week before wide rollout.
- Approve writes the week row and the ledger row as two calls; if a follow-up ever fails the week is closed
  without its ledger row. Candidate for a single database function later.

# Stage envelope & task allocations (Project Dashboard)

## Done
- `src/lib/projects/use-stage-envelope.ts`: derived stage envelope — capacity hours
  (baseline target hours, else sale value / avg sale rate), allocated hours, planned cost
  (per-resource effective cost rate), target planned cost from target margin
  (stage baseline -> project baseline -> 50%), projected margin, variance.
  `excludeAllocationId` so edits only move the delta. Nothing stored.
- `pm_tasks.notes` (nullable) — the only schema change.
- Task dialog does add + edit: parent stage context, live before/this task/after,
  capacity and margin warnings (non-blocking), notes.
- Double-click or kebab on a task row opens edit mode; delete already releases capacity
  because every rollup is derived.
- Stage rows show allocated/capacity hours + progress bar; planned cost vs target cost and
  projected margin only with `projects.financials`.
- Validated: acceptance maths (100h / 40h -> 80h -> delete -> 110h over) exact; preview
  renders chips and edit dialog with real data, no console errors.

## Open
- Gantt task bars still use the existing allocation popover editor rather than the new dialog.
- Planned vs Actual comparison view intentionally not built yet.
- [x] Work from home: half days (full/morning/afternoon) + approval vs notification-only mode — verified in preview (declared entries bypass the queue, half day = 0.5 in analytics, hours derived from daily_hours)
- [x] Marketing: 500MB bucket, TUS uploads >6MB with progress, server-side sender

## Office calendar (holidays + closures)
- [x] Admin "Calendário do atelier": holidays per year + closures (yearly repeat)
- [x] Closure → approved férias with preview/confirm; interns without entitlement skipped; sick leave days skipped; part-time pro rata; insufficient balance flagged; refunds
- [x] Shared calendar (Gantt, weekly board, timesheet expected hours); Gantt shading
- [x] Live-project re-schedule preview/apply, propagating links with lags
- [x] 2027 holidays — confirmed and saved (14, no Carnaval)
- [x] Tests incl. hours bank closure week = 0 owed (full-time + part-time)

## Current request — weekly project and private week notes
- [x] Independent notes storage, PSA project reads and editor-only HR topics; dedicated permission in existing permissions screen, no grant made to Irene without selection.
- [x] Latest earlier carry-over and opportunity-history relink within existing quote conversion; original conversion body otherwise unchanged.
- [x] Below-grid autosaving boxes, slot participants, existing project/opportunity picker, revision conflicts and audit labels; EN/PT parity verified.
- [x] 18 unit/regression checks passed; rollback security checks cover team/private reads, dedicated grant, conflicts and conversion. Signed-in January 2099 project copy verified status/text autosave after reload, skipped-week carry-over and independent history. Test notes/project/stages/bookings/tasks deleted; zero fixtures remain. Migrations 0119/0120 mirrored byte-for-byte; preview build OK.
- [x] Relative timeline by default for open proposals (18 moved; 2608/2609 live and 2670 sent/locked kept dates)
