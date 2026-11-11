import {describe,it,expect} from 'vitest';
import {plannerStageRole} from '../src/lib/projects/planner-stage-role';
import {buildProjectGanttTree} from '../src/lib/projects/build-project-gantt-tree';
import type {StageWithAllocations} from '../src/lib/projects/types';
describe('shared operational supplier identity',()=>{
 it('recognizes legacy Nulty external evidence without changing data or reading its proposal',()=>{
  expect(plannerStageRole({stage_role:null,is_self:false})).toBe('supplier_phase');
 });
 it('retains the external supplier role in the global/project hierarchy',()=>{
  const stage={id:'copy-nulty',project_id:'copy',is_self:false,stage_role:null,parent_stage_id:null,sort_order:1,start_date:'2026-11-16',end_date:'2026-11-20',budget:10100,allocations:[]} as StageWithAllocations;
  expect(buildProjectGanttTree([stage],'copy','Project').hierarchy.get('copy-nulty')?.role).toBe('supplier_phase');
 });
 it('uses supplier identity without requiring a role or a name match',()=>{
  expect(plannerStageRole({supplier_id:'supplier-copy'})).toBe('supplier_phase');
 });
 it('preserves client approval category and This is us architecture override',()=>{
  expect(plannerStageRole({stage_role:'client',is_self:true})).toBe('client');
  expect(plannerStageRole({stage_role:'supplier_group',is_self:true})).toBe('architecture');
 });
});
