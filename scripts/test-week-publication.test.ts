import {test} from 'node:test';
import assert from 'node:assert/strict';
import {affectedBookings,canConfirmPublication,type WeekPreview} from '../src/lib/projects/week-publication';
const p={offending_cells:[],overlaps:[],extensions:[],operations:[]} as unknown as WeekPreview;
test('approval requires explicit whole-week replacement confirmation',()=>{assert.equal(canConfirmPublication(p,false,false,false),false);assert.equal(canConfirmPublication(p,false,false,true),true);});
test('protected overlap needs its own acknowledgement',()=>{const v={...p,overlaps:[{}]} as WeekPreview;assert.equal(canConfirmPublication(v,false,true,true),false);assert.equal(canConfirmPublication(v,true,false,true),true);});
test('locked baseline extension needs separate acknowledgement',()=>{const v={...p,extensions:[{baseline_locked:true}]} as WeekPreview;assert.equal(canConfirmPublication(v,true,false,true),false);assert.equal(canConfirmPublication(v,false,true,true),true);});
test('unresolved planning always blocks publication',()=>{assert.equal(canConfirmPublication({...p,offending_cells:[{code:'invalidSlot'}]},true,true,true),false);assert.equal(canConfirmPublication(null,true,true,true),false);});
for (const action of ['remove','change','split'] as const) test(`${action} of a zero-hour booking needs extra confirmation even with an empty draft`,()=>{
 const v={...p,operations:[{action,resource_id:'r',before:{id:'zero',resource_id:'r',stage_id:'parent',start_date:'2026-10-19',end_date:'2026-10-30',day_part:null,hours_per_day:0,is_site_visit:false}}]};
 assert.equal(affectedBookings(v)[0].before?.id,'zero'); assert.equal(canConfirmPublication(v,false,false,true),false); assert.equal(canConfirmPublication(v,false,false,true,true),true);
});
test('new bookings alone do not require removal acknowledgement',()=>{assert.equal(canConfirmPublication({...p,operations:[{action:'create',resource_id:'r'}]},false,false,true),true);});
