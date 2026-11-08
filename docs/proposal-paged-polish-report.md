# Proposal paged view polish — 8 Nov 2026

Changed: `src/components/psa-composer/paginated-preview.tsx` (frame styles only); new check `scripts/test-composer-paged-polish.py`.

1. Sheets: screen-only (`@media screen`) grey gap of 24 px, border + shadow, "n / total" label below each sheet. Print/PDF rules untouched.
2. Header: the top-centre margin box was spanning into a second grid row (pushed below the margin, under content on pages 2+; centred/stacked on page 1). Now it sits in row 1 at full width; logo left, email/website right, same line, every page and PDF.

Throwaway browser-only copy of Hotel Chiado (writes blocked, source re-read equal):
- Screen 11 pages, PDF 11 physical pages, first block identical on all 11.
- Gaps between sheets: 24 px ×10. Header same-line on all 11 screen pages and in the print document.
- Open point: in the automated headless PDF the logo image had not loaded at capture time (contact text present); not verified in a real browser print.

Screenshots: `docs/proposal-paged-polish/`.
