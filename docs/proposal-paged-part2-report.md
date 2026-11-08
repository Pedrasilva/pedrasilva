# Proposal paged layout fixes, part 2 — 8 Nov 2026

Files changed
- `src/components/psa-composer/paginated-preview.tsx` — running header (top margin box, fixed offset) and footer (address bottom-left, "n / total" bottom-right) on every sheet; both follow the show toggles; letterhead image inlined so every sheet and the PDF paint it.
- `src/components/psa-composer/proposal-style-panel.tsx` — sliders keep the newest local value until saves settle (a refetch of an older save was snapping the slider and the paged view back).
- `src/lib/psa-proposal/heading-levels.ts` (new) — heading level + H1/H2 numbering and index.
- `src/components/psa-composer/canvas.tsx`, `block-renderer.tsx` — numbering/index by level; H1 unchanged markup, H2 `n.m`, H3/none unnumbered; in-block sub-headings capped at H3 size.
- `src/components/psa-composer/block-settings-panel.tsx`, `src/i18n/locales/{en,pt-PT}/common.json` — "Heading level" setting.
- `src/styles.css` — H2/H3 and sub-heading sizes from the heading scale.
- Tests: `scripts/test-heading-levels.test.ts` (5), `scripts/test-composer-paged-part2.py`, `scripts/test-composer-margin-live.py`.

Results (browser-only throwaway copy of Hotel Chiado, writes blocked or echoed locally, source re-read equal)
- Left margin 14 → 30 mm: pages 1–3 before/after in `docs/proposal-paged-part2/`. Live slider drag in the paged view: content area moved 53 → 98 px matching the slider (26 mm).
- Header/footer: same position on pages 1, 2 and 11, screen and PDF.
- "Âmbito e Descrição do Projeto" set to H2 → "1.1", indented in the index; later sections renumber.
- Parity: 11 screen pages = 11 PDF pages, first block identical on every page (14 mm and 30 mm runs).
- Note: in the automated test, fast key presses on the slider occasionally skip one step while pages re-lay out; the final value and pages always agree.
