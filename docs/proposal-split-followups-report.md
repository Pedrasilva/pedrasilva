# Proposal builder — Split and page parity, 8 November 2026

## Result
**PASS.** Split overlays no longer consume column width. Library and settings toggle independently, have close controls and Escape dismissal; state survives reload per authenticated person in this browser (not cross-device). Edit and Pages retain their existing panel layout. The editor is fitted by outer zoom; physical A4 source and iframe print pagination do not reflow.

| Width | Editor | Paged column | Editor overflow | Screenshots |
|---|---:|---:|---|---|
| 1400 px | 648 px | 648 px | None | [Split](proposal-split-followups/1400-split.png) · [drawers open](proposal-split-followups/1400-split-drawers.png) |
| 1740 px | 818 px | 818 px | None | [Split](proposal-split-followups/1740-split.png) · [drawers open](proposal-split-followups/1740-split-drawers.png) |

## Hotel Chiado comparison
The test copied the loaded proposal and all 27 blocks into a disposable browser-only fixture with new proposal/block IDs; live quote data was read-only. No database fixture was created. All document writes were intercepted, including one automatic snapshot attempt. The browser context was destroyed at completion, deleting the copy. Authenticated independent source reads confirmed identical original proposal/block rows (including the intentional duplicate stages); no B1 action, migration, financial/date/payment/contract write or B2 work occurred.

**Paged view: 11 pages. Printed PDF: 11 physical A4 pages**, independently counted with `pdfinfo`. Print used the completed iframe sheets/styles from the screen; no second Paged.js pass. All 11 first-block IDs, types and visible fragments matched the print-window DOM. The PDF was produced from that actual print window with Chromium PDF printing. Native OS printer dialogue remains untested.

[Printed PDF](proposal-split-followups/comparison.pdf) · [full first-block IDs and evidence](proposal-split-followups/results.json)

| Page | First block / visible continuation in paged view | Printed PDF |
|---|---|---|
| 1 | cover: Proposta de Honorários Hotel Chiado Proposta 26103 · 07/11/2026 | Same block and continuation |
| 2 | index: 20. Considerações Gerais 21. Suspensão ou Rescisão 22. Exclusões | Same block and continuation |
| 3 | stage_item: Âmbito e entregáveis | Same block and continuation |
| 4 | stage_item: Actividades Principais | Same block and continuation |
| 5 | stage_item: Resumo da Fase | Same block and continuation |
| 6 | stage_item: Aprovação da Fase | Same block and continuation |
| 7 | stage_item: Informação necessária do cliente | Same block and continuation |
| 8 | stage_item: Informação necessária do cliente | Same block and continuation |
| 9 | construction_fee: 15. Honorários em Obra | Same block and continuation |
| 10 | additional_services: Selecção de consultores fora do âmbito desta proposta Estudos ambientais, auditorias de acessibilidade e se… | Same block and continuation |
| 11 | exclusions: 22. Exclusões | Same block and continuation |

Continuation text is listed where a block began on an earlier page; exact disposable block IDs are in the JSON.

## Validation
- Browser assertions: equal columns, no horizontal clipping, overlay widths do not change columns, independent toggle/close controls, Escape closes both, reload restores open library/closed settings.
- Zero runtime errors and zero Paged.js inserted styles in the application document.
- 13 unit tests PASS (4 personal drawer rules, 5 readiness rules, 4 payment timing rules). Database-free iframe isolation test PASS. Translation checker: zero new candidates. Build OK.

## Changed files
- `src/components/psa-composer/composer-shell.tsx` — overlay panels, controls, personal preference integration and fitted editor.
- `src/components/psa-composer/split-drawers.ts` — user-scoped preference key/parser.
- `src/components/psa-composer/AGENTS.md` — Split rendering rule. Root AGENTS addition skipped because its protected size budget was reached.
- `scripts/test-composer-split-drawers.test.ts` — personal-state rule tests.
- `scripts/test-composer-split-parity.py` — safe browser-only copy, overlay/reload/print parity/preservation checks.
- `roadmap.md`, this report and `docs/proposal-split-followups/` screenshots/PDF/JSON.

No pagination/print engine, proposal content, translation values, global styles, route or B1 code was changed.
