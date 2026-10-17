# Conversion: preserve quoted days, hours and fees

## Current findings
- Ordinary stages and resource allocations already map quoted weekday offsets onto the live public-holiday/office-closure calendar. End dates extend instead of losing working days.
- Conversion copies quoted commercial totals into the project's sold fee and contract baseline rather than recalculating a reduced fee.
- Retainers preserve monthly effort by adjusting hours per working day; keep their existing month-based scheduling.
- The preview shows resulting dates and total fee, but does not explicitly compare calendar-caused date shifts or preserved effort. Full per-stage fee parity still needs a focused regression.

## Changes after approval
1. Show each stage's dates without holidays/closures → live dates in the existing conversion preview, retaining WBS labels and sorting.
2. Show quoted working days, total resource hours and stage fees alongside the existing total fee. Keep authored stage names unchanged.
3. Add a Christmas regression: a five-working-day stage starting 21 December 2026 with 24–25 December closed moves its end from 25 to 29 December, retaining 20 hours and €600 at 4 hours/day and €30/hour.
4. Verify actual preview and conversion on rollback-only fixtures, including stage/project fees, public holidays, office closures, dependency lag and retainer effort. Correct any demonstrated mismatch; leave already-correct scheduling alone.

## Safety boundaries
- No existing live project, allocation, timesheet or weekly-plan changes.
- Roll back every test record and test closure date; 2027 holidays remain unconfirmed and unsaved.
- Keep explicit preview/confirm and stale-preview safeguards.

## Technical details
- Extend pm_quote_conversion_preview with baseline dates and quoted effort/fee fields; preserve authorization and revision binding. Mirror the exact database change under supabase/migrations.
- Update the existing conversion dialog in src/routes/_app.crm.quotes.$quoteId.tsx; add matching EN/PT keys using existing shared terminology.
- Keep quote fee calculations weekday-only and reuse existing live calendar mapping; no new packages or framework changes.
- Add focused unit and rollback SQL tests next to existing conversion tests; run focused Gantt and weekly regressions.
- Verify the preview on screen without converting a real proposal; report remaining verification limits in at most three lines.
