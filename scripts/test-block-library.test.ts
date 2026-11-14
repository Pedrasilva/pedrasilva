import { describe, it, expect } from 'vitest';
import { appliesToDocument, isRepeatable, outlineBlocks, moveOutlineBlock, blockLibraryKey } from '../src/components/psa-composer/library-model';
import type { PsaProposalBlock } from '../src/lib/psa-proposal/types';
const block=(id:string, order:number, stage?:string) => ({id,sort_order:order,block_type:stage?'stage_item':'custom_text',source_ref:stage?{stage_id:stage}:{},title:id,content_rich:{}} as PsaProposalBlock);
describe('block library rules',()=>{
  it('single-use cover and letter; repeatable stage, text, image, table and page break',()=>{
    expect(['cover','letter','index','fee_table'].map(isRepeatable)).toEqual([false,false,false,false]);
    expect(['stage_item','custom_text','image','table','page_break'].map(isRepeatable)).toEqual([true,true,true,true,true]);
  });
  it('filters proposal and contract-only entries without hiding shared entries',()=>{
    expect(appliesToDocument('contract_relevant','proposal')).toBe(false);
    expect(appliesToDocument('proposal_only','contract')).toBe(false);
    expect(appliesToDocument('both','contract')).toBe(true);
  });
  it('keeps stage blocks in Gantt order while allowing other outline movement',()=>{
    const input=[block('text',0),block('construction',10,'b'),block('design',20,'a')];
    const ranks=new Map([['a',0],['b',1]]);
    expect(outlineBlocks(input,ranks).map(b=>b.id)).toEqual(['text','design','construction']);
    expect(moveOutlineBlock(outlineBlocks(input,ranks),'text','construction',ranks).map(b=>b.id)).toEqual(['design','construction','text']);
    expect(input.map(b=>b.id)).toEqual(['text','construction','design']);
  });
  it('recognizes existing description blocks as single use without rewriting content',()=>{
    expect(blockLibraryKey({block_type:'custom_text',title:'3. Descrição do Projeto',content_rich:{}})).toBe('description');
    expect(isRepeatable('description')).toBe(false);
  });
});