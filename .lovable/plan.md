Problem: In the proposal composer, the Phase Summary card ("Resumo da Fase") does not display the number of revision cycles even though the block settings panel has a "Ciclos de revisão incluídos" field.

Current state: `src/components/psa-composer/block-renderer.tsx` already reads `review_cycles_included` and computes `reviewLabel` in `PhaseSummaryCard`, but it never pushes that value into the `rows` array that renders the card. The toggle `showReview` exists but is unused.

Plan:
1. In `src/components/psa-composer/block-renderer.tsx`, inside `PhaseSummaryCard`, add a row to the `rows` array when `showReview` is true:
   - Label: `L.reviewCyclesIncluded`
   - Value: `reviewLabel` (already computed from `cr.review_cycles_included ?? 1`)
2. Keep the row conditional on `showReview` so hidden review cycles still respect the visibility setting.
3. The same `PhaseSummaryCard` is used for both the composer preview and the PDF renderer, so the fix will appear in both places without extra work.

No database or API changes are needed.