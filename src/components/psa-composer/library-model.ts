import type { PsaBlockType, PsaProposalBlock, PsaLibraryEntry, PsaContractRelevance } from '@/lib/psa-proposal/types';
import { sortRowsByStageRank } from '@/lib/quotes/stage-numbering';

export const LIBRARY_GROUPS = ['opening', 'project', 'phases', 'fees', 'contract', 'general'] as const;
export type LibraryGroup = typeof LIBRARY_GROUPS[number];
const groups: Record<PsaBlockType, LibraryGroup> = {
  cover:'opening', letter:'opening', index:'opening', about:'opening',
  scope:'project', consultants:'project',
  stage_list:'phases', stage_item:'phases', timeline:'phases', gantt_design:'phases', gantt_construction:'phases', gantt_partial:'phases',
  fee_table:'fees', supplier_fee_table:'fees', optional_fee_table:'fees', construction_fee:'fees', travel_expenses:'fees', billable_hourly_rate:'fees', payment_terms:'fees', payment_schedule:'fees', additional_services:'fees', appendix_payment_schedule:'fees',
  general:'contract', suspension:'contract', exclusions:'contract', acceptance:'contract', appendix_general_terms:'contract',
  custom_text:'general', image:'general', page_break:'general', appendix_index:'opening', appendix_gantt:'phases',
};
export function blockLibraryKey(block: Pick<PsaProposalBlock, 'block_type'|'title'|'content_rich'>): string {
  if (block.block_type !== 'custom_text') return block.block_type;
  if (block.content_rich.libraryRole === 'description' || /descri[çc][aã]o (?:do )?proje[ct]o|project description/i.test(block.title)) return 'description';
  if (block.content_rich.libraryRole === 'table') return 'table';
  return 'custom_text';
}
export function libraryEntryKey(entry: PsaLibraryEntry): string {
  return blockLibraryKey({block_type:entry.kind, title:entry.default_title, content_rich:entry.default_content_rich});
}
export function libraryGroup(entry: PsaLibraryEntry): LibraryGroup {
  if (libraryEntryKey(entry) === 'description') return 'project';
  if (entry.default_contract_relevance === 'contract_relevant') return 'contract';
  return groups[entry.kind];
}
export function isRepeatable(key: string): boolean {
  return ['stage_item','custom_text','image','table','page_break','gantt_partial'].includes(key);
}
export function appliesToDocument(relevance: PsaContractRelevance, type: 'proposal'|'contract'): boolean {
  return relevance === 'both' || (type === 'proposal' ? relevance === 'proposal_only' : relevance === 'contract_relevant');
}
/** Keep stage slots in document order, but their contents in canonical Gantt order. No writes. */
export function outlineBlocks(blocks: PsaProposalBlock[], ranks: Map<string,number>): PsaProposalBlock[] {
  const ordered = [...blocks].sort((a,b) => a.sort_order-b.sort_order);
  const stages = sortRowsByStageRank(ordered.filter(b=>b.block_type==='stage_item'), ranks, b=> typeof b.source_ref.stage_id==='string' ? b.source_ref.stage_id : undefined);
  let index=0;
  return ordered.map(b=>b.block_type==='stage_item' ? stages[index++] ?? b : b);
}
export function moveOutlineBlock(blocks: PsaProposalBlock[], from: string, to: string, ranks: Map<string,number>): PsaProposalBlock[] {
  const next=[...blocks]; const start=next.findIndex(b=>b.id===from); const end=next.findIndex(b=>b.id===to);
  if(start<0 || end<0) return next;
  const [block]=next.splice(start,1); if(!block) return next;
  next.splice(end,0,block);
  return outlineBlocks(next.map((b,i)=>({...b,sort_order:i})),ranks);
}