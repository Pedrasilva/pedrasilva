import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canConfirmPublication,type WeekPreview} from '../src/lib/projects/week-publication';
const p={offending_cells:[],overlaps:[],extensions:[]} as unknown as WeekPreview;
test('approval requires explicit whole-week replacement confirmation',()=>{assert.equal(canConfirmPublication(p,false,false,false),false);assert.equal(canConfirmPublication(p,false,false,true),true);});
test('protected overlap needs its own acknowledgement',()=>{const v={...p,overlaps:[{}]} as WeekPreview;assert.equal(canConfirmPublication(v,false,true,true),false);assert.equal(canConfirmPublication(v,true,false,true),true);});
test('locked baseline extension needs separate acknowledgement',()=>{const v={...p,extensions:[{baseline_locked:true}]} as WeekPreview;assert.equal(canConfirmPublication(v,true,false,true),false);assert.equal(canConfirmPublication(v,false,true,true),true);});
test('unresolved planning always blocks publication',()=>{assert.equal(canConfirmPublication({...p,offending_cells:[{code:'invalidSlot'}]},true,true,true),false);assert.equal(canConfirmPublication(null,true,true,true),false);});
