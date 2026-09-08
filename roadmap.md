# Weekly Timesheet Approval, Week Closure & Hours Bank

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
