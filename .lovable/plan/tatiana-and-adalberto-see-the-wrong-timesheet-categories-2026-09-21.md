# Tatiana and Adalberto see the wrong timesheet categories

## What is happening

The machinery for this already exists and works. Each person has a "work profile"
(Project / Mixed / Support) that decides which internal cost-center lines appear on
their timesheet. The categories are already labelled correctly:

- Support: Bookkeeping, Bank Reconciliation, Supplier / Purchasing Administration,
  HR Administration, General Administration, Office Management, Finance / Reporting
- Mixed: Marketing, Communication, Photography / Video, Website / Digital,
  Awards / Publications, Fee proposals, Business Development
- Everyone: Meetings, Training, Admin, Other Internal

The problem is purely the people records: **every collaborator, including Tatiana and
Adalberto, is still set to "Project"** (the default). That is exactly what her
screenshot shows — the generic project list, with no bookkeeping lines.

## The fix

Set the two work profiles to what they actually are:

- Tatiana Shchenina — Support (Backoffice)
- Adalberto Duarte — Mixed

Nothing else changes. No new tables, columns, categories or timesheet logic.

## After the change

- Tatiana's timesheet shows the backoffice lines (Bookkeeping, Bank Reconciliation,
  Supplier / Purchasing Administration, HR Administration, General Administration,
  Office Management, Finance / Reporting) plus the shared ones, with project entry
  hidden by default but still available if you grant it.
- Adalberto keeps project work and additionally gets the marketing and communication
  lines.
- Anyone else stays exactly as today.
- Hours already logged are untouched; historical lines keep showing on old weeks.

## Verification

- Re-read both people's records to confirm the saved profiles.
- Open the timesheet for each of them and confirm the expected category list, the
  weekly totals, leave/holiday rows and the weekly submission all behave as before.

## Notes

- Work profile is a timesheet-experience setting only. It does not touch costing,
  pricing, rates, margins or backoffice overhead.
- You can change it any time in HR, on the collaborator page.
