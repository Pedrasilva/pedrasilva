The issue is that the **Index block currently forces a page break after itself**, so any image placed after it jumps to the next page — leaving the page-1 space empty and the image disconnected from the content that follows. The builder also does not make page boundaries and available space obvious enough to reason about.

I will change the composer so the user can see exactly where pages break and how much space is free, then place images that fit that space without bouncing.

## What we will build

### 1. Optional page-break after the index
- Remove the hardcoded `proposal-page-break-after` on the `index` block.
- Add a per-block setting **"Quebra de página depois"** (page-break-after) to the right-hand panel, defaulting to `true` for index blocks so existing behaviour is preserved.
- When the user turns this off, the next block can flow on the same page after the index, allowing an image to fill the leftover space.

### 2. Visible page boundaries in the builder
- Render faint horizontal **page-break lines** across the canvas at every A4 boundary (screen-only), labelled with page numbers (Página 1, Página 2, …).
- These lines make it immediately obvious why an image sits on a new page and where the empty space is.

### 3. Smarter gap placeholders
- Keep the existing amber dashed gap overlays, but make them more informative:
  - Show the exact height in mm (e.g. *"Espaço livre: 132 mm"*).
  - Suggest the best image size bucket (1/4, 1/3, 1/2, 2/3).
- Ensure the gap is re-measured after explicit page-breaks (currently it is, but we will verify it is visible after the index when the page-break-after is toggled off).

### 4. Insert images that fit the gap
- When the user clicks a gap placeholder, insert an `image` block whose `size` is set to the suggested bucket, so its height matches the available space.
- If the previous block has `pageBreakAfter` enabled, the insert will first **disable that break** (with a toast explaining why), so the image stays on the same page and actually fills the space.
- After insertion, the image block is selected and the settings panel shows the chosen size.

### 5. Image size quick-pick in settings
- In the image block settings panel, expose the gap size when a gap is detected before/after the block, with a **"Ajustar ao espaço livre"** button that sets the image size to the bucket that fits.

## Files to change
- `src/components/psa-composer/canvas.tsx` — page-break-after logic, page-boundary lines, gap overlay improvements.
- `src/components/psa-composer/block-settings-panel.tsx` — add "Quebra de página depois" toggle and image size quick-pick.
- `src/styles.css` — styles for page-boundary lines and gap overlays.
- `src/lib/psa-proposal/types.ts` — if needed, type the new `pageBreakAfter` content flag.

## What stays the same
- Cover still starts on its own page and appendix blocks keep their own page-break rules.
- The PDF export continues to use the same A4 print rules; only the on-screen preview gets clearer visual guidance.

## One question before I start
Do you want the index block to **keep starting on its own page by default** (and only share the page when you explicitly turn off the page-break), or should the default be **sharing the page** so images naturally fill the space after the index?