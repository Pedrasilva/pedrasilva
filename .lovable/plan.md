## Confirmed problem

The builder currently uses four different pagination paths:

1. fixed 297 mm divider lines over a continuous document;
2. JavaScript heuristics and injected margins that guess where print will move content;
3. Paged.js for the in-app paginated preview;
4. the browser’s separate native print engine for the downloaded PDF.

The attached screenshots are the direct consequence: the editor ruler divides the uninterrupted screen layout mid-paragraph, while print applies heading, widow/orphan, and break-avoidance rules and moves “Project Description” to the following sheet. Further threshold tuning cannot make those independent engines reliably identical.

## Implementation

### 1. Establish one authoritative pagination pipeline
- Use the existing Paged.js page output as the single rendered document for both builder page layout and PDF export.
- Print/export the already-paginated page boxes instead of repaginating the continuous source with the browser’s separate print path.
- Ensure the exact same cloned content, proposal variables, fonts, margins, visibility rules, headers, footers, and break rules feed both the editable page view and export.

### 2. Replace continuous editing with true A4 sheets
- Keep a hidden React source document only as the content/state source for pagination.
- Display the generated A4 page stack as the main composer canvas in editing mode—not only after clicking Preview.
- Preserve block selection and editing by mapping every paginated fragment back to its `data-proposal-block-id`; clicking a fragment selects the original block and opens its editing controls.
- For inline rich text, activate an editor for the selected block and repaginate after committed/debounced changes so the document remains usable while content is changing.
- Preserve drag/reorder and block settings through the existing proposal block state rather than attempting to mutate cloned Paged.js DOM.

### 3. Remove the conflicting simulation
- Remove fixed page-marker calculations and dashed divider overlays from `canvas.tsx`.
- Retire `syncExplicitScreenBreaks`, `syncSmartScreenBreaks`, the 65 mm heading heuristic, forced-break spacer variables, and associated screen-only CSS.
- Retain only explicit user page-break settings and actual CSS fragmentation rules consumed by the authoritative paginator.
- Continue gap/image analysis only from real generated page geometry; do not let it alter pagination.

### 4. Make page boundaries visually unambiguous
- Render each page as an individual white A4 sheet on the neutral workspace background.
- Increase the vertical gap between sheets substantially and add a restrained page shadow/border.
- Show page numbers outside the printable content area.
- Leave unused page area plain white, as requested, so remaining space is visible exactly as it will be in the PDF—without dashed lines or tinted overlays crossing content.

### 5. Isolate proposal print styles
- Replace the proposal’s generic `.print-area` wrapper with a proposal-specific scope so unrelated legacy print rules cannot affect its fragmentation.
- Consolidate duplicate heading/block break rules into one proposal pagination section.
- Ensure invisible blocks, cover/index breaks, page-aligned blocks, images, tables, and the rotated Gantt follow the same rules in builder and exported PDF.

### 6. Loading and failure handling
- Add a stable pagination/loading state while fonts, images, or content are being laid out, preventing blank or partially generated sheets from flashing.
- Cancel stale pagination runs during rapid edits and apply only the latest result.
- Surface a clear localized EN/PT error state if pagination fails instead of silently showing blank pages.

## Verification

- Reproduce against the current proposal and specifically compare the “2. Project Description” break shown in the supplied screenshots.
- Verify builder and exported PDF have the same page count and the same first/last visible text on every page.
- Test default and customized body size, heading scale, margins, header/footer visibility, explicit breaks, index, images, long paragraphs, tables, hidden blocks, and Gantt appendix.
- Use browser automation to capture every builder sheet and every exported PDF page at desktop size and inspect all pages for blank sheets, clipped content, overlaps, incorrect headers/footers, and divergent break positions.
- Add a focused regression check that records block fragments per page and compares the builder page map with the exported page map.