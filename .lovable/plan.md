# Weekly timesheet approval, week closure and hours bank

## What exists today (audit)

- `pm_time_entries` is the single source of truth for hours: it already stores
  date, hours, notes, billable, `entry_type` (project / internal / non_working),
  `internal_category`, `leave_type`, plus a per-entry approval status used by the
  project-level approvals queue at `/projects/approvals`.
- `/projects/timesheet` already has Monday-based week navigation, a collaborator
  "view as" picker, project/internal/absence rows and prefill from approved
  vacation requests and public holidays.
- Leave lives in `vacation_requests` (type, period, hours, working days, approval).
- Collaborators already store `daily_hours` and `days_per_week`; resources store
  `weekly_capacity` — no need to hardcode 8h/40h anywhere.
- Permissions already include `timesheets.log`, `timesheets.view_team`,
  `timesheets.approve`, plus `hr.admin`. No new permission keys are needed.

## Smallest safe schema extension

Two new tables. No changes to existing tables, enums or leave logic.

1. `pm_timesheet_weeks` — one row per collaborator per week: week start/end,
   status (`open` / `submitted` / `returned` / `approved`), submitted/approved/
   reopened actor + timestamp, reviewer comment, snapshot totals (recorded,
   project, internal, leave hours), approved additional hours. It references
   time entries by person + date range rather than copying them.
2. `pm_hours_bank_entries` — the auditable ledger: collaborator, date, optional
   originating week, type (`additional_hours`, `converted_to_leave`,
   `paid_compensation`, `manual_adjustment`), signed hours, reason, created by,
   timestamp. Balance is always the sum of the ledger, never a stored number.

A database trigger blocks inserting, editing or deleting time entries that fall
inside a submitted or approved week, unless the acting user may approve
timesheets. Reopening a week restores editability.

## What gets built

**My week** (added to the existing `/projects/timesheet` screen)
A summary strip above the current grid: project / internal / leave / total hours,
current status, and a Submit week button with confirmation. Above 40h shows a
neutral workload notice, never a block. Submitted weeks turn the grid read-only.

**Weekly approval** (new screen under Projects → Timesheets)
Week selector, dashboard counters (submitted / approved / awaiting / not
submitted / above 40h / additional hours approved), filterable list of
collaborators with hours split and status.

**Individual week review** (side panel from that list)
Weekly totals, breakdown per project and activity, drill-down to daily entries,
Approve & close, Return for correction, optional comment. When the week exceeds
40h, approval requires ticking an explicit acknowledgement of how many additional
hours to bank; only those hours create a ledger entry.

**Hours bank** (on the collaborator HR profile, plus own balance for everyone)
Balance in hours converted to days using the person's own `daily_hours`, and the
full transaction history with running balance, linking back to the source week.
A Use / compensate action for HR lets them split hours between additional leave
and paid compensation, writing the matching negative ledger entries. Converting
to leave creates a normal request in the existing Vacations system — no parallel
leave store.

## Tone and structure

Under 40h is presented neutrally — never as hours owed. Weekly hours, project
hours and compensable additional hours stay separate fields on the week record so
a later phase can add capacity and utilisation analytics without reworking any of
this.

## Permissions

Collaborators edit and submit their own open weeks and see their own bank.
`timesheets.approve` holders review, approve, return and reopen weeks and
acknowledge additional hours. `hr.admin` sees every bank, records compensation and
manual adjustments (reason required). All enforced with row-level rules in the
database as well as in the interface.

## Verification

Typecheck, EN/PT translation parity, then in the running app: submit a week as a
collaborator, confirm entries lock, approve it as an approver, check a >40h week
banks only the acknowledged hours, reopen and confirm editing returns, and confirm
the existing timesheet, approvals queue and vacation flows are unchanged.
