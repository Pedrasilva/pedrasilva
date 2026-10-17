import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applySlotChanges, coveringStages, draftBoard, explicitSlots, shiftSlots, slotChanges } from "../src/lib/projects/week-draft";
import { deriveSlots, type BoardData, type BoardStage, type DraftSlot } from "../src/lib/projects/week-board";
const week="2026-06-15";
const stage:BoardStage={id:"s",project_id:"p",name:"Design",start_date:week,end_date:"2026-06-19",sort_order:0,parent_stage_id:null,stage_kind:null,is_milestone:false,is_self:false};
const slot:DraftSlot={resource_id:"r",day:week,part:"am",project_id:"p",stage_id:"s",is_site_visit:false};
const data:BoardData={resources:[{id:"r",name:"Person",color:null,collaborator_id:null,weekly_capacity:40}],projects:[{id:"p",name:"Project",client:null}],stages:[stage],allocations:[],leave:[],plan:null,draft_slots:[],my_collaborator_id:null};
describe("weekly draft rules",()=>{
 it("converts inferred bookings into explicit halves and drops overload extras",()=>{ const b=deriveSlots([{id:"a",resource_id:"r",stage_id:"s",project_id:"p",start_date:week,end_date:week,hours_per_day:6,day_part:null,is_site_visit:true,status:"committed",is_locked:false,source:null}],week,{r:8},[]); const slots=explicitSlots(b); assert.equal(slots.length,2); const draft=draftBoard(data,week,slots); assert.equal(draft.r[week].am?.inferred,false); assert.equal(draft.r[week].pm?.isSiteVisit,true); });
 it("stores only one project per half-day and reports replacement as one changed slot",()=>{const changes=slotChanges([slot],[{...slot,project_id:"q"}]); assert.equal(changes.length,1); assert.equal(changes[0].before?.project_id,"p"); assert.equal(changes[0].after?.project_id,"q");});
 it("erase produces one deletion and unchanged slots are not saved",()=>{assert.equal(slotChanges([slot],[slot]).length,0); assert.equal(slotChanges([slot],[])[0].after,null);});
 it("shift previous week seven days and skip target leave",()=>{assert.equal(shiftSlots([slot],data)[0].day,"2026-06-22"); assert.equal(shiftSlots([slot],{...data,leave:[{resource_id:"r",day:"2026-06-22",kind:"leave",name:null}]}).length,0);});
 it("shifted slots outside stage dates lose the stage rather than silently retaining it",()=>{assert.equal(shiftSlots([slot],data)[0].stage_id,null); assert.equal(shiftSlots([slot],{...data,stages:[{...stage,id:"next",start_date:"2026-06-22",end_date:"2026-06-26"}]} )[0].stage_id,"next");});
 it("leave cells never gain a booking even from stored slots",()=>{assert.equal(draftBoard({...data,leave:[{resource_id:"r",day:week,kind:"holiday",name:null}]},week,[slot]).r[week].am,null);});
 it("outside dates has no stage; overlapping dates offer both stages",()=>{assert.equal(coveringStages([stage],"p","2026-06-22").length,0); assert.equal(coveringStages([stage,{...stage,id:"s2"}],"p",week).length,2);});
 it("unresolved stages remain explicit null and site changes save",()=>{const board=draftBoard(data,week,[{...slot,stage_id:null}]); assert.equal(board.r[week].am?.stageId,null); assert.equal(slotChanges([slot],[{...slot,is_site_visit:true}])[0].after?.is_site_visit,true);});
 it("undo changes only the stroke's slots, preserving another planner's unrelated slot",()=>{const other={...slot,part:"pm" as const,project_id:"other"}; const result=applySlotChanges([{...slot,is_site_visit:true},other],[{...slot,is_site_visit:true}],[slot]); assert.equal(result.find(s=>s.part==="pm")?.project_id,"other"); assert.equal(result.find(s=>s.part==="am")?.is_site_visit,false);});
});