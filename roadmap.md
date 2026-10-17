# Weekly Timesheet Approval, Week Closure & Hours Bank

## Current request — Tatiana absence corrections and weekly approval
- [ ] Audit and remove only Tatiana's 8h on July 22 and 16h on August 19; record both as approved full-day unpaid absences.
- [ ] Approve/reconcile only her weeks June 1–October 12 in one transaction, preserving other people and all rates; verify each absence contributes 8h owed. Blocked on permission to synchronize her stale August vacation timesheet rows: August 17–18 still contain Vacation, while approved August 24–27 have no Vacation rows; August 19's 16h consists of 8h Admin plus 8h Vacation. No live corrections or approvals applied yet.
- [ ] Report removed activity costs, bank before/after, approved weeks and any blockers.

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
