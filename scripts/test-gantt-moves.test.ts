import {describe,it,expect} from "vitest";
import {moveStagesPatch,shiftProjectStartPatch,type ScheduleState} from "../src/lib/projects/schedule-engine";
const st=(id:string,s:string,e:string,x={})=>({id,start_date:s,end_date:e,...x});
// a: Mon 19–Fri 23 Oct; b FS0 → 26–30 Oct; c FS0 from b → 2–6 Nov
const base=():ScheduleState=>({stages:[st("a","2026-10-19","2026-10-23"),st("b","2026-10-26","2026-10-30"),st("c","2026-11-02","2026-11-06")],
  allocations:[{id:"rb",stage_id:"b",start_date:"2026-10-26",end_date:"2026-10-30"}],
  dependencies:[{id:"ab",predecessor_id:"a",successor_id:"b",type:"FS",lag_days:0},{id:"bc",predecessor_id:"b",successor_id:"c",type:"FS",lag_days:0}],
  holidays:[],relative:false,revision:"r"});
describe("Gantt stage moves",()=>{
  it("1. dragging a linked stage later keeps the drop and sets FS +5d; successors and resources follow",()=>{
    const p=moveStagesPatch(base(),[{id:"b",start_date:"2026-11-02",end_date:"2026-11-06",move:true}]);
    expect(p.stages.find(s=>s.id==="b")).toEqual(st("b","2026-11-02","2026-11-06"));
    expect(p.dependencies.find(d=>d.id==="ab")?.lag_days).toBe(5);
    expect(p.stages.find(s=>s.id==="c")?.start_date).toBe("2026-11-09");
    expect(p.allocations).toEqual([{id:"rb",start_date:"2026-11-02",end_date:"2026-11-06"}]);
  });
  it("1b. dragging earlier than the link allows sets a lead (FS -2d)",()=>{
    const p=moveStagesPatch(base(),[{id:"b",start_date:"2026-10-22",end_date:"2026-10-28",move:true}]);
    expect(p.dependencies.find(d=>d.id==="ab")?.lag_days).toBe(-2);
    expect(p.stages.find(s=>s.id==="b")?.start_date).toBe("2026-10-22");
  });
  it("2. dragging an unlinked stage moves it and its successors follow",()=>{
    const p=moveStagesPatch(base(),[{id:"a",start_date:"2026-10-26",end_date:"2026-10-30",move:true}]);
    expect(p.stages.map(s=>[s.id,s.start_date])).toEqual([["a","2026-10-26"],["b","2026-11-02"],["c","2026-11-09"]]);
    expect(p.dependencies.every(d=>d.lag_days===0)).toBe(true);
  });
  it("3. project start shifts unlinked stages by working days and linked stages follow",()=>{
    const s=base();s.stages.push(st("z","2026-10-21","2026-10-22"));
    const {patch,days}=shiftProjectStartPatch(s,"2026-10-21");
    expect(days).toBe(2);
    expect(patch.stages.map(v=>[v.id,v.start_date])).toEqual([["a","2026-10-21"],["b","2026-10-28"],["c","2026-11-04"],["z","2026-10-23"]]);
    expect(patch.allocations[0]?.start_date).toBe("2026-10-28");
  });
  it("4. locked stages refuse the move with a reason, and stay put on project shift",()=>{
    const s=base();s.stages[1]={...s.stages[1],is_locked:true};
    expect(()=>moveStagesPatch(s,[{id:"b",start_date:"2026-11-02",end_date:"2026-11-06",move:true}])).toThrow("gantt.schedule.locked");
    const l=base();l.stages[0]={...l.stages[0],is_locked:true};
    expect(()=>shiftProjectStartPatch(l,"2026-10-26")).toThrow("gantt.schedule.locked");
  });
  it("5. undo data: the patch keeps the original lag in the prior state",()=>{
    const s=base();const p=moveStagesPatch(s,[{id:"b",start_date:"2026-11-02",end_date:"2026-11-06",move:true}]);
    expect(s.dependencies.find(d=>d.id==="ab")?.lag_days).toBe(0);
    const back=moveStagesPatch({...s,stages:s.stages.map(v=>({...v,...p.stages.find(x=>x.id===v.id)})),dependencies:p.dependencies},
      [{id:"b",start_date:"2026-10-26",end_date:"2026-10-30",move:true}]);
    expect(back.dependencies.find(d=>d.id==="ab")?.lag_days).toBe(0);
    expect(back.stages.find(v=>v.id==="c")?.start_date).toBe("2026-11-02");
  });
});
describe("imported summary-to-child links",()=>{
  it("are ignored for scheduling so moves are not blocked as circular",()=>{
    const s=base();s.stages.push(st("p","2026-10-19","2026-11-06"));s.stages[0].parent_stage_id="p";
    s.dependencies.push({id:"pa",predecessor_id:"p",successor_id:"a",type:"FS",lag_days:0});
    const p=moveStagesPatch(s,[{id:"c",start_date:"2026-11-09",end_date:"2026-11-13",move:true}]);
    expect(p.stages.find(v=>v.id==="c")?.start_date).toBe("2026-11-09");
    expect(p.dependencies.find(d=>d.id==="pa")?.lag_days).toBe(0);
  });
});
import {reflowForCalendar,scheduleCalendar} from "../src/lib/projects/schedule-engine";
// Christmas closure 2026: 24, 28, 29, 30, 31 Dec (25 Dec is a holiday; 1 Jan a holiday).
const XMAS=["2026-12-24","2026-12-28","2026-12-29","2026-12-30","2026-12-31"];
const HOL=["2026-12-25","2027-01-01"];
describe("office calendar",()=>{
  it("a stage across a public holiday skips it",()=>{
    expect(scheduleCalendar(["2026-12-08"]).shift("2026-12-07",1)).toBe("2026-12-09");
  });
  it("a 10-day stage across the closure ends later and keeps 10 working days",()=>{
    const s:ScheduleState={stages:[st("a","2026-12-21","2027-01-05")],allocations:[{id:"r",stage_id:"a",start_date:"2026-12-21",end_date:"2027-01-05"}],
      dependencies:[],holidays:[...HOL,...XMAS],relative:false,revision:"r"};
    expect(scheduleCalendar(HOL).duration("2026-12-21","2027-01-05")).toBe(10);
    const {patch}=reflowForCalendar(s,HOL);
    expect(patch.stages).toEqual([st("a","2026-12-21","2027-01-12")]);
    expect(scheduleCalendar(s.holidays).duration("2026-12-21","2027-01-12")).toBe(10);
    expect(patch.allocations[0]?.end_date).toBe("2027-01-12");
  });
  it("a lag across the closure keeps its working-day lag and successors follow",()=>{
    const s:ScheduleState={stages:[st("a","2026-12-14","2026-12-18"),st("b","2026-12-28","2027-01-04")],allocations:[],
      dependencies:[{id:"ab",predecessor_id:"a",successor_id:"b",type:"FS",lag_days:3}],holidays:HOL,relative:false,revision:"r"};
    // Old calendar: FS+3 from 18 Dec → 24 Dec, b actually starts 28 Dec = 1 extra working day of gap.
    const {patch}=reflowForCalendar({...s,holidays:[...HOL,...XMAS]},HOL);
    const b=patch.stages.find(v=>v.id==="b");
    const cal=scheduleCalendar([...HOL,...XMAS]);
    expect(b?.start_date).toBe(cal.shift("2026-12-18",3+1+1));
    expect(patch.dependencies[0]?.lag_days).toBe(3);
  });
  it("stages untouched by the change do not move, even with existing gaps",()=>{
    const s=base();s.dependencies[0]={...s.dependencies[0],lag_days:0};s.stages[1]={...s.stages[1],start_date:"2026-11-02",end_date:"2026-11-06"};
    expect(reflowForCalendar({...s,holidays:XMAS},[]).patch.stages).toEqual([]);
  });
  it("locked stages stay in place",()=>{
    const s:ScheduleState={stages:[st("a","2026-12-21","2027-01-04",{is_locked:true})],allocations:[],dependencies:[],holidays:[...HOL,...XMAS],relative:false,revision:"r"};
    expect(reflowForCalendar(s,HOL).patch.stages).toEqual([]);
  });
});
