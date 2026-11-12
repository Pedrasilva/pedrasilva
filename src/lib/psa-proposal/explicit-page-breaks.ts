/** Collapse editor-only break markers into boundaries between printable blocks.
 * Paged.js cannot reliably break an empty (print-hidden) marker. No prose is
 * read or rewritten here; the following real block owns that boundary.
 */
export function prepareExplicitPageBreaks(root: HTMLElement) {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-proposal-block-id]'));
  let pending = false;
  let previous: HTMLElement | undefined;
  for (const block of blocks) {
    if (block.dataset.visiblePrint === 'false' || block.classList.contains('print:hidden')) continue;
    if (block.dataset.proposalBlockType === 'page_break') {
      pending = true;
      block.remove();
      continue;
    }
    if (previous && (pending || block.classList.contains('proposal-page-break-before'))) {
      block.dataset.explicitPageBreakBefore = 'true';
    }
    pending = block.classList.contains('proposal-page-break-after');
    previous = block;
  }
}