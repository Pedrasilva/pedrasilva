# Office calendar: public holidays + office closures

## Step 1 findings (current state)
- The Gantt counts stage durations, lags and resource dates in working days (Mon–Fri minus Hub holidays). Resource hours and fees follow those dates.
- The holiday list holds only 2025 and 2026 (14 per year: national holidays plus Lisbon on 13 June). There are no 2027 holidays, so any 2027 plan currently counts holidays as working days.
- Timesheet expected hours and automatic holiday entries read the same holiday list. The weekly planning board shows holidays and leave. The hours bank uses the approved week totals. Each screen reads the list separately, there is one shared rule only on the Gantt, and nothing knows about office closures.

## What gets built
1. **Admin page "Calendário do atelier"** (admins only)
   - Holidays by year: add, edit, delete. Lisbon's 13 June stays a municipal holiday.
   - Office closures: name, start, end, "repeat every year". Repeats are expanded per year (for example 24 Dec–1 Jan).
2. **Closures become mandatory annual leave**
   - For each active collaborator, an approved annual-leave record covers the closure's working days (no weekends or holidays), skipping days already booked as leave.
   - Part-time: hours are deducted pro rata to contract hours, on the same basis as an ordinary leave day for that person.
   - If the balance is not enough, the record is still created and flagged to you in a list on the page.
   - Each record is tagged with its closure, so shortening or removing a closure refunds exactly those days.
   - Before anything is written: a preview of person × days deducted or refunded, then "Apply" to confirm. Timesheet absence entries follow automatically through the existing leave rules, and submitted or approved weeks are not touched.
3. **One shared working-day calendar**: Mon–Fri minus holidays minus closure days. Every screen reads the same list: Gantt scheduling and shaded columns, weekly planning board, timesheet expected hours. The hours bank is unchanged because it already uses the approved week totals.
4. **Gantt shading**: holidays and closures shown as shaded columns. A 10-day stage that crosses the Christmas closure ends later.
5. **Live projects are never moved silently.** After holidays or closures change, a "Review affected projects" preview lists each live stage that would move and by how many working days, with resources. "Apply" saves through the normal Gantt save, so undo and the safeguards still work. Locked and imported items are listed as "kept".
6. **CRM proposals in relative weeks/months** keep ignoring the calendar until the project goes live (unchanged).

## Defaults I will assume (tell me if any is wrong)
- Closures apply to every active collaborator, including interns, but not to people whose contract has ended or not yet started on those days.
- A shortened or removed closure refunds only the leave the closure created, never leave a person booked themselves.
- 2027 national holidays plus Lisbon will be added as editable rows so 2027 plans are correct.

## Tests
Unit tests: a stage across a holiday; across the closure; a lag across the closure; yearly repeat; leave deduction including part-time and existing-leave overlap; a shortened closure (refund). One check on an isolated test copy, then removed. Live projects, timesheets and the weekly board are not changed. Every database change is mirrored in supabase/migrations.

## Technical details
- New tables: `office_closures` (name, start, end, repeats_yearly) and `office_closure_leave` (closure, collaborator, date, vacation_request_id). Grants and RLS: admins write, staff read.
- `vacation_requests` gets a nullable `office_closure_id`. Closure leave is inserted as `estado='aprovado'`, `tipo` = annual leave, so `vacation_request_sync_timesheet_trg` produces the non_working entries.
- `pm_office_calendar(from,to)` returns holiday and closure dates. `pm_gantt_state` uses it for `holidays`. Browser hooks `use-non-working-days`, `use-timesheet` and `week-board` read it instead of `holidays` alone.
- Preview and apply functions run as admin-only security definer, using advisory locks and a revision token. The live-project re-schedule reuses `recomputeSchedule` with every stage as a root, saved per project via `pm_gantt_save`.
