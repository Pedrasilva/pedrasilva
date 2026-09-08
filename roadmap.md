# Roadmap

## Weekly timesheet approval, week closure & hours bank
- [ ] Schema: pm_timesheet_weeks + pm_hours_bank_entries (+ lock trigger, RLS, grants)
- [ ] Capacity resolver from collaborators.daily_hours/days_per_week (no hardcoded 40h)
- [ ] Week totals hook: accounted / working / project / internal / leave / excess
- [ ] "My week" summary + Submit Week on /projects/timesheet; lock when submitted/approved
- [ ] Weekly Approval screen (/projects/timesheet-approvals) + per-person review panel
- [ ] Approve with explicit additional-hours acknowledgement (<= calculated excess, reason if reduced)
- [ ] Return / Reopen with actor, timestamp, reason; reconcile bank entry on re-approval
- [ ] Hours Bank ledger UI on HR collaborator profile + own access
- [ ] Compensate: convert to leave (reuse vacation_requests) / paid / manual adjustment with reason
- [ ] EN/PT translations, typecheck, i18n parity, verification matrix
