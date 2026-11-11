# Gantt — publication readiness, 11 November 2026

## Verdict: DO NOT PUBLISH YET

The previously outstanding financial-access, fiscal-evidence protection and global resize checks now pass. However, this is **not a complete all-entry-point release certificate**: an additional inspector dependency-create check passed globally but did not establish persistence from the project inspector. No application defect has yet been isolated from the automation targeting. CRM inspector dependency checks were not reached by that run. The shared adapter create/delete tests pass on all three surfaces. The separately unfinished proposal Cover/Letter/PDF work is another whole-app publication limitation, not a Gantt test failure.

No application code or migration changed in this validation. No product decision changed. B1 remains OFF. Tests wrote only named disposable projects/proposals, temporary project-scoped access for the selected test account and synthetic fiscal evidence. Cleanup independently returned zero residual named fixtures and zero QA fiscal documents.

## Complete coverage table
PASS (historical) means the linked earlier report is the evidence; it is not claimed as a new live rerun.

| Phase / rule | Result | Evidence |
|---|---|---|
| Phase 1 shared chart, inspector, toolbar | PASS (historical) | [Phase 1](project-proposal-gantt-phase1-report.md); same controls visible in new screenshots |
| External supplier icon/hatching, Nulty distinction | PASS (historical) | Phase 1 disposable supplier evidence; no real backfill |
| Accepted conversion preserves supplier identity | PASS (historical) | Synthetic accepted conversion in Phase 1 |
| Converted project edits leave accepted quote untouched | PASS (historical) | Phase 1/2 converted-copy evidence |
| Financial-only project editor UI | PASS — rerun | Patricia: no financial access → no commercial editor; disposable Financials-only grant → confirmation/reason UI saved 1000 → 1200 and reload reads 1200 |
| No financial access: UI and direct write | PASS — rerun | No add-stage control/commercial editor; direct stage date write denied; commercial RPC and schedule RPC both Forbidden |
| Cross-project write refused | PASS — rerun | Same financial-only actor refused on second disposable project |
| Dates free; payment timing follows stages | PASS | New mouse/date checks; [incoming dates evidence](project-incoming-dates-report.md); no contractual marker from date movement |
| Contract reference / current values / difference / totals | PASS (historical + visible rerun) | Phase 2 converted reference evidence; current totals 1200 and 2350 shown in new captures |
| Missing legacy reference not fabricated as zero | PASS | Screenshots show reference to confirm; no real baseline altered |
| Substage allocated / remaining | PASS — rerun | 400+200 of 1000 = 600 allocated, 400 remaining |
| Sequential over-cap / parent reduction rejected | PASS — rerun | Extra 500 rejected; parent reduction to 500 rejected |
| Concurrent substage cap | PASS — new | Two concurrent 600 inserts into 1000: exactly one succeeds; 600 allocated / 400 remaining |
| Costs over fee warn, not block | PASS automated | Actuals suite: exact threshold, amber/red priority; no timesheet mutation |
| Stage value responsibility + reason | PASS UI/server | Financial-only actor saved 1000→1200 through dialog; recorded actor matches authenticated identity |
| Immediate payment update | PASS — fiscal fixture | 1000→2000: issued 300 + paid 200 unchanged; open value becomes 1500 |
| Append-only history / actor / old-new / reason | PASS — rerun | Real Patricia/Luis actor IDs, reasons and values; history UPDATE denied |
| New stages outside contract | PASS | New disposable stages visibly outside contract, creation history recorded |
| Retainer freely add month | PASS UI — rerun | 3×100→4 months, parent 400 and extension history |
| Retainer agreement/responsibility/reason | PASS UI/server — rerun | Confirmation disabled until both checkboxes and reason; missing consent denied server-side |
| Retainer forward-only | PASS — rerun | October/November 100 untouched, December/January 150; retroactive request refused |
| Stage value edit preserves issued invoices and confirmed payments | PASS — NEW | Four full synthetic client invoices and two financial payment records linked to milestones; before/after entire documents, lines, receipts identical |
| Retainer value edit preserves issued invoices and confirmed payments | PASS — NEW | December issued 100 and January paid 100 unchanged; February open 100→150; parent 350 |
| Below protected amounts / direct fiscal amount tampering | PASS — NEW | Stage decrease to 400 refused; direct protected amount edit refused |
| Global mouse drag + reload | PASS — rerun | 30 Nov→14 Dec, persisted |
| Global end-handle resize + reload | PASS — NEW | End 4 Jan→6 Jan; start unchanged and reread after reload |
| Project mouse drag / end-handle resize / reload | PASS — NEW | Drag 30 Nov→9 Dec; end 4 Jan→13 Jan; start unchanged |
| CRM mouse drag / end-handle resize / reload | PASS — NEW | Relative 17 Jan→24 Jan 2000; end 4 Feb→9 Feb; reload equal |
| Start and duration fields, all three surfaces | PASS — rerun | Project/global start 7 Dec; CRM week 4, two weeks. Field interactions/readback captured in initial complete gesture run |
| FS/SS/FF/SF adapter create/remove, all three surfaces | PASS — rerun | Actual shared scheduling module readback for each type, no residual link |
| FS/SS/FF/SF inspector UI globally | PASS — additional check | Each selected/created/read back/deleted via panel |
| FS/SS/FF/SF inspector UI project | NOT VERIFIED / blocking | Extra automation did not read a saved FS after clicking its chosen add control; no error toast. Needs correct-button reproduction before product changes |
| FS/SS/FF/SF inspector UI CRM | NOT VERIFIED | Additional run stopped before CRM; adapter paths pass |
| Shared save enum audit | PASS | Repair regression test checks exact project enum cast/mirror; quote cast already present; no other enum write in shared save |
| B1 OFF / independent fixture zero | PASS | All final cleanup readbacks false; independent query no named project/quote/fiscal rows |

## Automated checks
- Vitest: 72 passed in seven suites.
- Bun test: 31 passed in actuals and weekly-publication suites.
- Initial runner mismatch was corrected: node:test suites use Bun's test runner, not Vitest. No failing product assertion in the final 103 tests.
- Latest available application signal: build OK, 17:59:08 UTC. No application source edit required a new build this turn.

## Evidence and files changed
- This report and `docs/gantt-release-validation/` (JSON readbacks, logs, screenshots).
- `scripts/check_access.py`, `scripts/check_fiscal.py`, `scripts/check_concurrency.py`: retained disposable-only regression checks; credentials read from environment/session file, never recorded. Access test requires the intentionally selected test actor session. Fiscal cleanup removes child evidence before parent documents.
- `roadmap.md` updated with actual completed checks and explicit remaining publication blockers.
- `docs/DECISIONS.md` unchanged: no agreed product decision changed.
- **No application implementation files, migrations, real-data records or real access grants changed.**

Screenshots: [financial-only editor](gantt-release-validation/access-editor.png), [denied UI](gantt-release-validation/access-denied.png), [protected retainer](gantt-release-validation/fiscal-retainer.png), [global resize](gantt-release-validation/project-0-resize.png), [project resize](gantt-release-validation/project-1-resize.png), [CRM resize](gantt-release-validation/quote-0-resize.png).
