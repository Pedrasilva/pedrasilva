# Shared Gantt — dependency/date regression

**11 November 2026. B1 remains OFF. No real project/proposal data changed.**

## Cause

Phase 1 migration `0270_shared_gantt_financial_scope_and_supplier_identity.sql`, commit `bc3ed67a` (11 November, 12:01 UTC), replaced the shared `pm_gantt_save` function and omitted the project dependency `::pm_dep_type` cast. Phase 2 migrations 0276/0277 retained that omission. The older 0087 function had the cast.

Dependency creation reproduced the exact reported error. Moving a successor retimes its dependency lag; the same atomic transaction updates dates then rewrites dependencies. The text-to-enum error rolls back the entire transaction, explaining why drag/date changes do not stick. An unlinked stage need not hit this failure. The quote branch already casts to `quote_dep_type`; a converted CRM schedule uses the project branch.

## Correction

Additive migration 0278 restores `(d->>'type')::public.pm_dep_type` in the deployed function. A guarded, exact single-fragment replacement preserves all other deployed code, project-scoped permissions, quote locks, fiscal protections and transaction/revision controls. No client workaround or bypass was added.

All three entry points reach this function through `src/lib/projects/gantt-schedule.ts`: quote adapter `src/lib/quotes/use-quote-planner-adapter.ts`, project adapter `src/lib/projects/use-project-planner-adapter.ts`, and global `src/routes/_app.projects.gantt.tsx` → `GlobalProjectSchedule` → `QuoteGantt`. Thus one correction covers the affected entry points.

Enum audit: the shared save writes dependency types only; quote insertion already has `::quote_dep_type`. Other writes in this function are UUID/date/integer/boolean fields, not enums. Both dependency enums contain FS, SS, FF, SF. No additional missing enum cast was found in this function.

## Verification

- Before: disposable project dependency creation **and** linked-stage move fail with `column "type" is of type pm_dep_type but expression is of type text`; saved dates remain unchanged.
- After: same reproduction passes both actions; successor persists at 24–30 November instead of 23–27 November.
- Project page: FS/SS/FF/SF create/delete through the real shared adapter and database readback pass. Mouse drag persists; start-date field persists at 7 December; duration field persists and reads back after reload (end 24 December). Screenshot below.
- CRM proposal page: FS/SS/FF/SF create/delete through the real shared adapter and database readback pass. Mouse drag persists; relative start week 4 and duration 2 weeks persist after reload at 24 January–4 February 2000 (relative storage, not displayed operational dates). Screenshot below.
- Global page: FS/SS/FF/SF create/delete through the shared adapter pass. **Mouse drag, start/date-duration fields and reload were not completed in this view**: the automated global page stopped responding while mounting/refreshing its schedules, including after browser-only fixture list isolation. This is not certified as a full global UI pass. No global application code was altered.
- Dependency tests above use the actual shared scheduling module from authenticated rendered pages, not mouse-created links; no claim of four-type mouse-link verification.
- 37 focused tests pass: dependency cast/mirror, linked-stage retiming, all dependency calculations and atomic milestone save/Undo/Redo.
- Build log: build OK. Final authenticated cleanup: zero projects/quotes named `[QA DISPOSABLE] Save surfaces`; residual copies from interrupted runs deleted by exact IDs. Fresh independent database zero check recorded separately. B1 preview reports `active=false`.

## Files changed

- `drizzle/migrations/0278_gantt_dependency_enum_cast.sql`
- `supabase/migrations/20261111161000_gantt_dependency_enum_cast.sql` — byte-identical mirror
- Tool-managed migration journal/snapshot and generated database types
- `scripts/test-gantt-dependency-cast.test.ts`
- `roadmap.md`
- This report and `docs/gantt-save-regression/` screenshots

Application frontend/source scheduling files were not changed. No additional Phase 2 work performed.

## Screenshots

- [Project date/duration after reload](gantt-save-regression/project-0-persisted.png)
- [CRM relative date/duration after reload](gantt-save-regression/quote-0-persisted.png)

## Outstanding verification

Complete the global-view mouse drag, start-date/duration and reload checks when the automated global page can remain responsive. The database regression is reproduced and corrected, but this report does not claim the entire requested UI matrix is complete.