# Weekly Timesheet Approval, Week Closure & Hours Bank

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
