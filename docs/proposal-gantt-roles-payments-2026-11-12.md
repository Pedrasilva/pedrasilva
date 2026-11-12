# Gantt roles + payment plan — 12/11/2026 (D48)
Test: separate copied quote 102948d5… (document 6fc175b4…), fixture retained per scripts/AGENTS.md; Oleiro blocks verified unchanged. B1 OFF.
## Files
- src/components/psa-composer/document-gantt.tsx (summary variant, annex heading «Anexo B – …», label thinning)
- src/components/psa-composer/document-gantt.css (summary styles, keep together)
- src/components/psa-composer/block-renderer.tsx (only appendix_gantt gets landscape sheets)
- src/lib/psa-proposal/live-data.ts (retainer monthly invoices via retainerPaymentDates)
- scripts/test-proposal-gantt-roles-payments-e2e.py (new), src/components/psa-composer/AGENTS.md
## Pages (copy, PT, 34 pages)
Portrait everywhere except p.24. p.13 «5. Cronograma de Projeto» inline summary (Arquitectura + 5 subfases, Mês 1–8). p.15 «6.3 Cronograma de Obra» inline summary (Construction, Concurso, Avença). p.22–23 Anexo A: FT01–06 per stage + FT07–18 avença 3 000 €, total 201 840 € + IVA 46 423 € = 248 263 €. p.24 landscape «Anexo B – Programa do Projeto», full programme Mês 1–19 on one sheet.
## Real Oleiro data (NOT changed — needs Luis OK)
1. Stored payment schedule has one row: Arquitectura stage_end 0 € (stale "New stage" sync).
2. Arquitectura bills as one rolled-up line (children_bill_independently=false); per-stage invoices need it ON, then «Sincronizar com Gantt».
3. «Programa» has role supplier_group (treated as supplier); should be architecture.
4. «Avença fase de obra» starts 03/01 (week 1), no parent and no FS dependency on Projecto de Execução (ends week 31). Proposal: add FS dependency → starts first working day of next month (D43), place under Construction.
5. «Monthly Assistance» (0 €, supplier_group, under Construction) still exists.
