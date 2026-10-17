import {describe,it,expect} from "vitest";
import {recomputeSchedule,scheduleCalendar,dependencySlack,reviewScheduleLinks,type ScheduleState} from "../src/lib/projects/schedule-engine";
const stage=(id:string,start_date:string,end_date:string)=>({id,start_date,end_date});
const base=():ScheduleState=>({stages:[stage("a","2026-10-19","2026-10-23"),stage("b","2026-11-02","2026-11-06")],
  allocations:[{id:"resource",stage_id:"a",start_date:"2026-10-20",end_date:"2026-10-22"}],dependencies:[],holidays:[],relative:false,revision:"test"});
describe("Gantt scheduling rules",()=>{
  it("allows sibling dependencies under a summary",()=>{
    const s=base();s.stages.push(stage("parent","2026-10-01","2026-12-31"));
    s.stages[0].parent_stage_id="parent";s.stages[1].parent_stage_id="parent";
    const links=[{id:"ab",predecessor_id:"a",successor_id:"b",type:"FS" as const,lag_days:0}];
    expect(reviewScheduleLinks(s.stages,links).rejected).toEqual([]);
    expect(recomputeSchedule(s,links,[],["b"]).stages.find(v=>v.id==="b")?.start_date).toBe("2026-10-26");
  });
  it("reviews a summary-to-descendant circular link without modifying the original",()=>{
    const s=base();s.stages.push(stage("parent","2026-10-01","2026-12-31"));s.stages[1].parent_stage_id="parent";
    const link={id:"parent-child",predecessor_id:"parent",successor_id:"b",type:"FS" as const,lag_days:0};s.dependencies=[link];
    const reviewed=reviewScheduleLinks(s.stages,s.dependencies);
    expect(reviewed.rejected).toEqual([link]);expect(reviewed.accepted).toEqual([]);expect(s.dependencies).toEqual([link]);
  });
  it("moves a summary using its child duration rather than stale parent dates",()=>{
    const s=base();s.stages.push(stage("parent","2026-10-01","2026-12-31"));s.stages[1].parent_stage_id="parent";
    const link={id:"ap",predecessor_id:"a",successor_id:"parent",type:"FS" as const,lag_days:0};
    expect(recomputeSchedule(s,[link],[],["parent"]).stages.find(v=>v.id==="parent")).toEqual(stage("parent","2026-10-26","2026-10-30"));
  });
  it("shrinks every resource to the edited stage bounds",()=>{
    const result=recomputeSchedule(base(),[],[stage("a","2026-10-19","2026-10-21")]);
    expect(result.allocations).toEqual([{id:"resource",start_date:"2026-10-19",end_date:"2026-10-21"}]);
  });
  it("extends every resource to the edited stage bounds",()=>{
    expect(recomputeSchedule(base(),[],[stage("a","2026-10-19","2026-10-28")]).allocations[0]?.end_date).toBe("2026-10-28");
  });
  for(const type of ["FS","SS","FF","SF"] as const) for(const lag_days of [-2,0,2]) {
    it(`${type} uses signed working-day lag ${lag_days}`,()=>{
      const s=base(); const dep={id:"link",predecessor_id:"a",successor_id:"b",type,lag_days};
      const result=recomputeSchedule(s,[dep],[],["b"]);
      const b=result.stages.find(s=>s.id==="b");
      expect(b).toBeDefined();
      if(!b) return;
      expect(dependencySlack(s.stages[0],b,dep)).toBe(0);
      expect(scheduleCalendar().duration(b.start_date,b.end_date)).toBe(5);
    });
  }
  it("deletion recomputes remaining rules and retains position with no rule",()=>{
    const s=base(); expect(recomputeSchedule(s,[],[],["b"]).stages).toEqual([]);
    expect(recomputeSchedule(s,[{id:"ss",predecessor_id:"a",successor_id:"b",type:"SS",lag_days:0}],[],["b"]).stages[0]?.start_date).toBe("2026-10-19");
  });
  it("skips public holidays in live calendars",()=>{
    const s=base();s.holidays=["2026-10-26"];
    expect(recomputeSchedule(s,[{id:"fs",predecessor_id:"a",successor_id:"b",type:"FS",lag_days:0}],[],["b"]).stages[0]?.start_date).toBe("2026-10-27");
  });
  it("ignores actual public holidays in CRM relative mode",()=>{
    const s=base();s.holidays=["2026-10-26"];s.relative=true;
    expect(recomputeSchedule(s,[{id:"fs",predecessor_id:"a",successor_id:"b",type:"FS",lag_days:0}],[],["b"]).stages[0]?.start_date).toBe("2026-10-26");
  });
  it("rejects circular links",()=>expect(()=>recomputeSchedule(base(),[
    {id:"ab",predecessor_id:"a",successor_id:"b",type:"FS",lag_days:0},
    {id:"ba",predecessor_id:"b",successor_id:"a",type:"FF",lag_days:0}])).toThrow("gantt.schedule.cycle"));
  it("preserves locked successors",()=>{
    const s=base();s.stages[1]={...s.stages[1],is_locked:true};
    expect(recomputeSchedule(s,[{id:"ab",predecessor_id:"a",successor_id:"b",type:"FS",lag_days:0}],[],["b"]).stages).toEqual([]);
  });
  it("rejects resizing imported allocations",()=>{
    const s=base();s.allocations[0].is_locked=true;
    expect(()=>recomputeSchedule(s,[],[stage("a","2026-10-19","2026-10-21")])).toThrow("gantt.schedule.lockedAllocation");
  });
  it("keeps the latest incoming rule and exposes the other gap",()=>{
    const s=base();s.stages.push(stage("c","2026-11-09","2026-11-13"));
    const links=[{id:"ab",predecessor_id:"a",successor_id:"b",type:"SS" as const,lag_days:0},{id:"cb",predecessor_id:"c",successor_id:"b",type:"SS" as const,lag_days:0}];
    const b=recomputeSchedule(s,links,[],["b"]).stages.find(v=>v.id==="b");
    expect(b?.start_date).toBe("2026-11-09");if(b)expect(dependencySlack(s.stages[0],b,links[0])).toBe(15);
  });
  it("normalizes Technical Design ending Sunday 7 March 2027 backwards",()=>{
    expect(recomputeSchedule(base(),[],[stage("a","2027-03-01","2027-03-07")]).allocations[0]?.end_date).toBe("2027-03-05");
  });
  it("keeps resource effort and snapshots while deriving the changed hours and fee",()=>{
    const s=base();s.allocations[0]={...s.allocations[0],hours_per_day:4,cost_rate_snapshot:20,sale_rate_snapshot:30} as typeof s.allocations[0];
    const allocation={...s.allocations[0],...recomputeSchedule(s,[],[stage("a","2026-10-19","2026-10-21")]).allocations[0]} as typeof s.allocations[0]&{hours_per_day:number;cost_rate_snapshot:number;sale_rate_snapshot:number};
    const hours=scheduleCalendar().duration(allocation.start_date,allocation.end_date)*allocation.hours_per_day;
    expect(hours).toBe(12);expect(hours*allocation.cost_rate_snapshot).toBe(240);expect(hours*allocation.sale_rate_snapshot).toBe(360);
  });
  it("rolls up parent bounds from children",()=>{
    const s=base();s.stages.push({...stage("parent","2026-10-01","2026-12-31")});
    s.stages[0].parent_stage_id="parent";s.stages[1].parent_stage_id="parent";
    expect(recomputeSchedule(s).stages.find(v=>v.id==="parent")).toEqual(stage("parent","2026-10-19","2026-11-06"));
  });
});