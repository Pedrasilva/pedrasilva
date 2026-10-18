import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultStage, isOutsideStage, outsideExtensionNotes, setSlotStage, slotKey } from "../src/lib/projects/week-draft";
import { removalMode } from "../src/lib/projects/allocation-removal";
import type { BoardStage, DraftSlot } from "../src/lib/projects/week-board";
const st=(id:string,start:string,end:string):BoardStage=>({id,project_id:"p",name:id,start_date:start,end_date:end,sort_order:0,parent_stage_id:null,stage_kind:null,is_milestone:false,is_self:false});
const a=st("a","2026-10-01","2026-10-21"), b=st("b","2026-11-02","2026-11-30");
const slot=(day:string,stage_id:string|null="a"):DraftSlot=>({resource_id:"r",day,part:"am",project_id:"p",stage_id,is_site_visit:false});
const week=["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"];
describe("weekly stage picker",()=>{
  it("defaults to the only stage covering the week, none when ambiguous",()=>{assert.equal(defaultStage([a,b],"p",week),"a"); assert.equal(defaultStage([a,{...b,start_date:"2026-10-22"}],"p",week),null);});
  it("keeps a chosen stage outside its dates and flags it",()=>{assert.equal(isOutsideStage([a],slot("2026-10-23")),true); assert.equal(isOutsideStage([a],slot("2026-10-21")),false); assert.equal(isOutsideStage([a],slot("2026-10-23",null)),false);});
  it("proposes one extension per stage until the last outside day, never shortening",()=>{const n=outsideExtensionNotes([a],[slot("2026-10-22"),slot("2026-10-23")],[]); assert.deepEqual(n,[{project_id:"p",stage_id:"a",from:"2026-10-01",until:"2026-10-23"}]); assert.deepEqual(outsideExtensionNotes([a],[slot("2026-10-22")],n),n); assert.equal(outsideExtensionNotes([a],[slot("2026-10-20")],[]).length,0);});
  it("assigns a stage to selected slots in one go, leaving others",()=>{const s=[slot("2026-10-19",null),slot("2026-10-20",null)]; const r=setSlotStage(s,new Set([slotKey(s[0])]),"a"); assert.equal(r[0].stage_id,"a"); assert.equal(r[1].stage_id,null);});
  it("allocations with logged hours are retired, empty ones deleted",()=>{assert.equal(removalMode(0),"delete"); assert.equal(removalMode(0.25),"retire");});
});
import { bookableStages } from "../src/lib/projects/week-draft";
describe("supplier stages",()=>{
  it("are never offered to PSA staff; unmarked stages stay bookable",()=>{assert.deepEqual(bookableStages([{id:"own",is_self:true},{id:"me",is_self:false},{id:"legacy",is_self:null}]).map(s=>s.id),["own","legacy"]);});
});
