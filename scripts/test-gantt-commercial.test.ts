import {describe,it,expect} from 'vitest';
import {commercialProjectValue,splitBalance,commercialStageValue} from '../src/lib/projects/gantt-commercial';
describe('approved Gantt Phase 2 value ownership',()=>{
 it('Concept 1000 remains 1000 with splits totalling only 600',()=>{const s=[{id:'p',budget:1000,commercial_value_owned:true},{id:'c',budget:600,parent_stage_id:'p'}];expect(commercialProjectValue(s)).toBe(1000);});
 it('splits can use less, but never more than 1000',()=>{expect(splitBalance(1000,[400,200])).toEqual({allocated:600,remaining:400,valid:true});expect(splitBalance(1000,[600,500]).valid).toBe(false);});
 it('current 2000 replaces the stage value without double-counting splits',()=>{expect(commercialProjectValue([{id:'p',budget:2000,commercial_value_owned:true},{id:'c',budget:600,parent_stage_id:'p'}])).toBe(2000);});
 it('legacy structural summaries preserve child aggregation',()=>{const s=[{id:'p',budget:999},{id:'c',budget:600,parent_stage_id:'p'}];expect(commercialProjectValue(s)).toBe(600);});
 it('retainer total counts the parent once, not monthly children',()=>{expect(commercialProjectValue([{id:'r',budget:3000,stage_kind:'retainer_monthly',commercial_value_owned:true},{id:'m',budget:1000,parent_stage_id:'r',stage_kind:'retainer_month'}])).toBe(3000);});
 it('missing current values stay unavailable',()=>expect(commercialStageValue({id:'p',budget:null},[])).toBeNaN());
});