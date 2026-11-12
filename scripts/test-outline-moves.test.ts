import {describe,it,expect} from 'vitest';
import {outlineMove} from '../src/lib/quotes/outline-moves';
const rows = [
  {id:'arch',parent_stage_id:null,sort_order:20},
  {id:'pe',parent_stage_id:'arch',sort_order:50},
  {id:'construction',parent_stage_id:'arch',sort_order:60},
  {id:'tender',parent_stage_id:'construction',sort_order:10},
  {id:'retainer',parent_stage_id:'construction',sort_order:20},
  {id:'other',parent_stage_id:null,sort_order:30},
];
describe('shared outline movement',()=>{
  it('retainer up swaps with tender, not the project root',()=>expect(outlineMove(rows,'retainer','up').find(r=>r.id==='retainer')).toEqual({id:'retainer',parent_stage_id:'construction',sort_order:10}));
  it('retainer outdent follows its construction parent',()=>expect(outlineMove(rows,'retainer','outdent').find(r=>r.id==='retainer')).toEqual({id:'retainer',parent_stage_id:'arch',sort_order:30}));
  it('root retainer indents into preceding group after its existing children',()=>{
    const input=rows.filter(r=>r.id!=='retainer').concat({id:'retainer',parent_stage_id:null,sort_order:25});
    expect(outlineMove(input,'retainer','indent').find(r=>r.id==='retainer')).toEqual({id:'retainer',parent_stage_id:'arch',sort_order:30});
  });
  it('up across a group enters it after its children',()=>expect(outlineMove(rows,'other','up').find(r=>r.id==='other')).toEqual({id:'other',parent_stage_id:'arch',sort_order:30}));
  it('down across a group enters it before its children',()=>expect(outlineMove(rows,'pe','down').find(r=>r.id==='pe')).toEqual({id:'pe',parent_stage_id:'construction',sort_order:10}));
  it('first child up moves before parent, without a cycle',()=>expect(outlineMove(rows,'tender','up').find(r=>r.id==='tender')?.parent_stage_id).toBe('arch'));
  it('last child down moves after parent',()=>expect(outlineMove(rows,'retainer','down').find(r=>r.id==='retainer')?.parent_stage_id).toBe('arch'));
  it('numeric edit stays in its sibling group',()=>expect(outlineMove(rows,'retainer','position',1).find(r=>r.id==='retainer')?.parent_stage_id).toBe('construction'));
});