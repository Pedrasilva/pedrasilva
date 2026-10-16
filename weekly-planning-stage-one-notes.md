# Weekly planning — Stage 1 review

## Delivered
- Read-only `/projects/week-plan`, with a link beside the Gantt in Agenda.
- Monday–Friday morning/afternoon person view and a read-only project view.
- Previous/next/Today controls, colour stripe/full-colour controls, inferred `~` tooltips, site-visit pins, overlap popovers, leave/holiday cells and personal-row highlighting.
- Additive allocation fields `day_part` and `is_site_visit`; protected week-plan and slot tables. No existing allocation values changed.
- Staff-only `pm_week_board` read with explicit safe fields and planner-only draft visibility.
- EN/PT translations. No editing, approval, notifications, timesheet writes or Gantt rendering changes.

## Verified
- Live signed-in page at `/projects/week-plan?week=2026-06-15`: 13 resources, 28 overlapping allocations, 9 with nonzero daily hours, 1 approved leave date; three project rows.
- Signed-in Luis row highlighted; approved leave on June 16 greyed out; denominator 8 rather than 10.
- Current October week has 15 overlapping allocations but all have 0 daily hours; per the requested inference rules, they produce no booked halves. No hours were invented or allocation data changed.
- Raw `pm_week_board` response contains no cost/sale/hourly rates, salary or cost snapshots.
- Person/project views, colour controls, next week navigation and 390px layout work; page width 390, board scroll width 950; no browser page errors.
- 13 slot/capacity/leave/overlap tests pass, including Ricardo's exact example and legacy 6/3/8h rows, part-time capacity and weekends.
- Existing 7 pursuit tests and financial-rollup tests pass. i18n parity and latest preview compilation pass.
- Existing allocation count remains 94; all `day_part` values remain null. The quote-to-Gantt adapter adds only null/false defaults for these new fields.

## Unverified
- An actual non-planner session opening the page and direct RLS isolation against a populated draft: the injected account is a planner, and sandbox SQL cannot assume the authenticated role. No account was arbitrarily selected and no permission was weakened for testing.
- Live holiday rendering was not exercised; leave/holiday capacity behavior is unit-tested.
- Existing Gantt/editor/forecast/cost screens were not all exercised interactively; calculation regressions pass, data and rendering logic remain unchanged.

Stage 2 and Stage 3 are deliberately not started; Stage 1 is available for review.