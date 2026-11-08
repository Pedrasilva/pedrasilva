import type { PsaProposalBlock } from './types';

/** Explicit overrides win; named chapter blocks are headings, not page furniture. */
export function keepBlockWithNext(block: Pick<PsaProposalBlock, 'block_type' | 'title' | 'content_rich'>): boolean {
  const explicit = block.content_rich?.keepWithNext;
  if (typeof explicit === 'boolean') return explicit;
  return !!block.title?.trim() && !['cover', 'index', 'page_break', 'image', 'acceptance', 'appendix_gantt'].includes(block.block_type);
}

export const REPAGINATION_DELAY_MS = 300;