# Gantt final validation — 11 November 2026

## Release status: NOT fully validated

No application code or migrations changed. No product decision changed; DECISIONS.md remains unchanged. B1 remains OFF (audit revision 10). Only named disposable fixtures were written and deleted.

| Check | Result | Evidence / limitation |
|---|---|---|
| Global Gantt mouse drag and reload | PASS | Start moved 30 Nov → 14 Dec; reread from saved schedule |
| Project Gantt mouse drag and reload | PASS | Start moved 30 Nov → 9 Dec |
| CRM Gantt mouse drag and reload | PASS | Relative start moved 17 Jan → 24 Jan 2000 |
| Global/project start-date field and duration field, reload | PASS | Start 7 Dec; end 24 Dec; screenshots |
| CRM relative start and duration fields, reload | PASS | Start week 4; two weeks; end 4 Feb 2000 |
| FS, SS, FF, SF create/remove on all three surfaces | PASS via shared adapter | Each saved type read back and removed; not mouse-created links |
| End-handle duration resize gesture | NOT VERIFIED | Duration input passed, not the resize handle |
| Retainer add month without approval | PASS | Three × €100 → four months, parent €400; extension history |
| Monthly value confirmation and required reason | PASS | Confirm disabled without both responsibility/client agreement; saved reason |
| Retainer forward-only changes and reload | PASS | December-effective €150: October/November stay €100; December/January €150; parent €500 |
| Retainer retroactive change / missing client consent | PASS | Server refused both |
| Append-only history | PASS | Real authenticated actor and reason recorded; update refused |
| Substage allocated / remaining | PASS | €400 + €200 within €1,000; displayed €600 allocated / €400 remaining |
| Substage over-limit / parent reduction | PASS | Extra €500 and parent reduction to €500 both refused server-side |
| Concurrent split cap | NOT VERIFIED | Sequential over-limit check passed; no concurrent transaction test |
| Financial-only editor / denied user UI and server | NOT RE-RUN | Earlier Phase 1 evidence does not substitute for this requested rerun |
| Issued invoice / confirmed payment immutability under value change | NOT VERIFIED | Source guards inspected, but no fiscal fixture exercised this turn |
| Full commercial checks repeated in CRM and global views | NOT VERIFIED | Retainer/splits browser checks ran in project view only |

## Test evidence

- 9 focused tests passed: `scripts/test-gantt-commercial.test.ts` (6), `scripts/test-project-team-management.test.ts` (3).
- Build signal: latest available entry `build OK`.
- Browser fixtures cleaned in `finally`, with post-delete readback for project/quote gesture fixtures and commercial project. B1 audit independently confirms OFF/revision 10.
- Global browser read results were filtered to the disposable project for safe isolated targeting; production readers were not changed.
- No reproduced product failure was established. Earlier gesture attempts missed the visible bar or used a wrong selector; corrected test targeting passed. These are not application fixes.

## Screenshots and stored results

- [Global after reload](gantt-final-validation/project-0-persisted.png)
- [Project after reload](gantt-final-validation/project-1-persisted.png)
- [CRM after reload](gantt-final-validation/quote-0-persisted.png)
- [Retainer confirmation](gantt-final-validation/retainer-confirmation.png)
- [Retainer after reload](gantt-final-validation/retainer-reloaded.png)
- [Allocated / remaining](gantt-final-validation/split-balance.png)
- [Commercial concrete readbacks](gantt-final-validation/commercial-results.json)

## Files changed

This report, the seven evidence files above, and `roadmap.md` only. No migrations, application implementation, access grants, real projects, real proposals or fiscal records changed.

The remaining NOT VERIFIED rows must be completed before claiming final approval for team use.