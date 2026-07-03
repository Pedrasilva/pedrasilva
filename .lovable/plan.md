# Proposal Appendices

Introduce an "Appendices" section rendered after the main proposal, driven by modular appendix components that can be individually enabled per proposal.

## Data model

Extend `PsaProposalBlock.block_type` with three new kinds:
- `appendix_index` — renders the "APPENDICES" cover + list
- `appendix_payment_schedule` — Appendix A
- `appendix_gantt` — Appendix B (A3 landscape)
- `appendix_general_terms` — Appendix C

No schema migration needed: `block_type` is a free string in `psa_proposal_blocks`. `content_rich` stores per-appendix config: `{ appendix_letter, enabled, intro_html, intro_text, page_orientation }`.

## Composer surface

Block library panel gets a new "Appendices" group with four manual entries:
- Índice de Anexos
- Anexo A — Cronograma de Pagamentos
- Anexo B — Programa do Projeto (A3)
- Anexo C — Termos Gerais PSA

Inserting an appendix block appends it after all existing blocks and forces `contract_relevance = "both"`.

Block settings panel adds an "Anexo" section for appendix blocks with:
- Letter override (A/B/C/…)
- Enabled toggle
- Intro rich text
- Orientation selector (only for `appendix_gantt`: portrait / A3-landscape)

## Rendering

`block-renderer.tsx` new cases:
- `appendix_index` — renders a full page: title "APPENDICES", then rows `Anexo {letter} — {title}` for every enabled appendix block in the same proposal. Reads sibling blocks via a new `siblings` prop passed by canvas.
- `appendix_payment_schedule` — reuses existing `payment_schedule` rendering logic (extracted into a `PaymentScheduleTable` helper), prefixed with the fixed intro copy from the brief.
- `appendix_gantt` — reuses existing `timeline` rendering, wrapped in a landscape print container (`className="proposal-appendix-landscape"`).
- `appendix_general_terms` — renders a `<GeneralTermsDocument />` component that pulls the latest approved terms via `useLatestGeneralTerms()` (existing hook if present, otherwise a stub reading `psa_general_terms` table by `status = 'approved'` ordered by `version desc`).

Every appendix wraps in `<div className="proposal-page-break proposal-appendix">…</div>` so print CSS forces `break-before: page`.

`styles.css` additions:
```css
.proposal-appendix { page-break-before: always; break-before: page; }
.proposal-appendix-landscape { size: A3 landscape; }
@page appendix-landscape { size: A3 landscape; }
```

## Main proposal cleanup

The existing `payment_schedule` and `timeline` blocks stay in the library (legacy). Add a "Convert to appendix" action in the block settings for those two types that:
1. Creates the matching appendix block at the end of the proposal.
2. Replaces the current block's content with the short reference sentence from the brief and switches its type to `custom_text`.

No automatic removal — user controls migration per proposal.

## Files touched

- `src/lib/psa-proposal/types.ts` — extend `PsaBlockType` union.
- `src/components/psa-composer/block-library-panel.tsx` — add "Anexos" group + 4 manual entries.
- `src/components/psa-composer/block-renderer.tsx` — extract `PaymentScheduleTable`; add appendix cases; accept `siblings` for index.
- `src/components/psa-composer/canvas.tsx` — pass all sibling blocks to renderer.
- `src/components/psa-composer/block-settings-panel.tsx` — appendix config section + "Convert to appendix" button on legacy payment_schedule/timeline blocks.
- `src/lib/psa-proposal/live-data.ts` — add labels (`appendices`, `appendixA`, `appendixIntro`, references).
- `src/styles.css` — appendix + landscape print rules.
- (new) `src/components/psa-composer/general-terms-document.tsx` — renders latest approved terms; if no source table exists, renders a static PT/EN template pulled from `docs/psa-general-terms.md` (created in same edit).

## Out of scope

- Automated migration of existing proposals.
- PDF page numbering across appendices (relies on browser print `@page` counter).
- Uploading custom General Terms per proposal (future work).
