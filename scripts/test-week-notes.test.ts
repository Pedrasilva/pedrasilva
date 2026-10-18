import { describe, it, expect } from 'vitest';
import { latestNotes, noteSeed, noteParticipants, type WeekNote } from '../src/lib/projects/week-notes';
import type { BoardData } from '../src/lib/projects/week-board';
const row = (week:string,kind:WeekNote['kind']='project'):WeekNote => ({id:week,week_start:week,kind,project_id:kind==='project'?'p':null,opportunity_id:kind==='opportunity'?'o':null,status:'stand_by',notes:week,target_text:'end of Oct',flag:'Blocked',week_topics:{humanResources:'Private'},added_manually:true,carried_from_week:null,revision:3,updated_by:'u',updated_at:'2026-10-01'});
describe('weekly notes rules',() => {
 it('uses the most recent earlier note across skipped holiday weeks',() => {
   const result=latestNotes([row('2098-01-06'),row('2098-01-20'),row('2098-02-10')],'2098-02-03');
   expect(result.map(n => n.week_start)).toEqual(['2098-01-20']);
   expect(noteSeed(result[0],'2098-02-03').carried_from_week).toBe('2098-01-20');
 });
 it('keeps current week independent and preserves editable carried fields',() => {
   const source=row('2098-01-20'); const seed=noteSeed(source,'2098-02-03');
   seed.notes='New'; expect(source.notes).toBe('2098-01-20');
   expect(seed.status).toBe('stand_by'); expect(seed.target_text).toBe('end of Oct'); expect(seed.flag).toBe('Blocked');
   expect(noteSeed(row('2098-02-03'),'2098-02-03').carried_from_week).toBeNull();
 });
 it('keeps week topics separate from project and opportunity notes',() => {
   expect(latestNotes([row('2098-01-20'),row('2098-01-20','week'),row('2098-01-20','opportunity')],'2098-02-03')).toHaveLength(3);
 });
 it('participants come only from slots and are deduplicated in resource order',() => {
   const data={resources:[{id:'a',name:'Irene'},{id:'b',name:'Luis'}]} as BoardData;
   const slots=[{resource_id:'a',project_id:'p'},{resource_id:'a',project_id:'p'},{resource_id:'b',project_id:'other'}] as BoardData['draft_slots'];
   expect(noteParticipants(data,slots,'p')).toEqual(['Irene']);
 });
});