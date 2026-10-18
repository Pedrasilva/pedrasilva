import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { actualBudgetBand,actualPlanDailyHours,buildGanttActuals,type ActualActivity,type ActualStage } from "../src/lib/projects/gantt-actuals";

const plan={id:"a",resourceId:"r",start:"2026-06-12",end:"2026-06-21",hoursPerDay:6};
const stage=():ActualStage=>({id:"s",parentId:null,budget:129050,start:"2026-06-01",end:"2026-06-25",plans:[plan]});
const entry=(patch:Partial<ActualActivity>={}):ActualActivity=>({id:"e",stageId:"s",personId:"r",resourceId:"r",name:"Copied collaborator",date:"2026-06-12",hours:8,cost:240,...patch});
const calculate=(stages=[stage()],activities=[entry()])=>buildGanttActuals({stages,activities,asOf:"2026-10-18",holidays:new Set(),summaryId:"project"});

describe("Gantt actuals read-only calculations",()=>{
  it("F3 allocation baseline is 4 people × 6 days × 6h = 144 planned hours",()=>{
    const s=stage();s.plans=[0,1,2,3].map(n=>({...plan,id:`a${n}`,resourceId:`r${n}`}));
    const actual=calculate([s],[entry({hours:362.68,cost:12219.6818})]).totals.get("s");
    assert.equal(actual?.planned,144);assert.equal(actual?.logged,362.68);assert.equal(actual?.cost,12219.6818);assert.equal(actual?.remaining,116830.3182);assert.equal(actual?.band,"normal");
  });
  it("each person's activity is attributed by real identity, not planned shares",()=>{
    const s=stage();s.plans.push({...plan,id:"b",resourceId:"other"});
    const r=calculate([s],[entry(),entry({id:"otherEntry",personId:"other",resourceId:"other",hours:3,cost:90})]);
    assert.equal(r.people.get("s")?.find(p=>p.id==="r")?.weeks[0].logged,8);
    assert.equal(r.people.get("s")?.find(p=>p.id==="other")?.weeks[0].logged,3);
  });
  it("deduplicates entry ids but preserves separate activities",()=>{
    const e=entry();const r=calculate([stage()],[e,e,entry({id:"second",hours:2,cost:60})]);assert.equal(r.totals.get("s")?.logged,10);assert.equal(r.totals.get("s")?.cost,300);
  });
  it("Monday weeks include Sunday and exclude holidays from planned hours",()=>{
    const r=buildGanttActuals({stages:[stage()],activities:[entry({date:"2026-06-14"})],asOf:"2026-10-18",holidays:new Set(["2026-06-12"]),summaryId:"project"});
    const w=r.people.get("s")?.[0]?.weeks[0];assert.equal(w?.start,"2026-06-08");assert.equal(w?.planned,0);assert.equal(w?.difference,8);
  });
  it("marks outside hours day-by-day even within a partially planned week",()=>{
    const r=calculate([stage()],[entry({date:"2026-06-11"}),entry({id:"inside",date:"2026-06-12",hours:2})]);const w=r.people.get("s")?.[0]?.weeks[0];assert.equal(w?.outside,8);assert.equal(w?.logged,10);assert.equal(w?.planned,6);assert.equal(w?.difference,4);
  });
  it("unallocated people have a zero-plan row",()=>{const r=calculate([stage()],[entry({personId:"new",resourceId:"new"})]);assert.equal(r.people.get("s")?.[0]?.unplanned,true);assert.equal(r.people.get("s")?.[0]?.weeks[0].planned,0);});
  it("retired bookings do not contribute planned hours but real activities survive",()=>{const s=stage();s.plans=[{...plan,removed:true}];const r=calculate([s]);assert.equal(r.totals.get("s")?.planned,0);assert.equal(r.totals.get("s")?.logged,8);assert.equal(r.people.get("s")?.[0]?.unplanned,true);});
  it("0h markers never invent weekly hours from the fee",()=>{const s=stage();s.plans=[{...plan,hoursPerDay:0}];const r=calculate([s]);assert.equal(r.totals.get("s")?.planned,0);assert.equal(r.people.get("s")?.[0]?.weeks[0].planned,0);});
  it("explicit allocation percentage uses contractual daily hours",()=>{assert.equal(actualPlanDailyHours({...plan,hoursPerDay:0,percentage:50,dailyHours:4}),2);assert.equal(actualPlanDailyHours({...plan,percentage:50,dailyHours:4}),6);});
  it("missing saved costs suppress remaining and consumed percentages",()=>{const t=calculate([stage()],[entry({cost:null})]).totals.get("s");assert.equal(t?.cost,null);assert.equal(t?.remaining,null);assert.equal(t?.consumed,null);assert.equal(t?.missingHours,8);assert.equal(t?.band,"incomplete");});
  it("parent fee is children-only while direct parent actuals are added once",()=>{
    const parent={...stage(),id:"parent",budget:25500,plans:[]};const child={...stage(),parentId:"parent",budget:20291};
    const r=calculate([parent,child],[entry(),entry({id:"parentHours",stageId:"parent",hours:29,cost:989.77})]);
    assert.equal(r.totals.get("parent")?.budget,20291);assert.equal(r.totals.get("project")?.budget,20291);assert.equal(r.totals.get("parent")?.logged,37);assert.equal(r.totals.get("project")?.cost,1229.77);
  });
  it("project-only imports are not guessed into stages",()=>{const r=calculate([stage()],[entry({stageId:null,imported:true})]);assert.equal(r.totals.get("s")?.logged,0);assert.equal(r.totals.get("project")?.logged,8);assert.equal(r.totals.get("project")?.importedHours,8);});
  it("future logged entries are not counted as cost to date",()=>{assert.equal(calculate([stage()],[entry({date:"2026-10-19"})]).totals.get("s")?.logged,0);});
  it("authorized aggregates override raw partial totals without inventing people",()=>{
    const r=buildGanttActuals({stages:[stage()],activities:[entry()],asOf:"2026-10-18",holidays:new Set(),summaryId:"project",aggregates:new Map([["s",{logged:20,cost:600,missingHours:0}]]),limited:true});assert.equal(r.totals.get("s")?.logged,20);assert.equal(r.people.get("s")?.[0]?.weeks[0].logged,8);assert.equal(r.limited,true);
  });
  it("calculations never mutate activities, plans or costs",()=>{const stages=[stage()],activities=[entry()];const before=JSON.stringify({stages,activities});calculate(stages,activities);assert.equal(JSON.stringify({stages,activities}),before);});
  it("planned-only people retain a zero-logged weekly delta",()=>{const r=calculate([stage()],[]);assert.equal(r.people.get("s")?.[0]?.weeks[0]?.logged,0);assert.equal(r.people.get("s")?.[0]?.weeks[0]?.difference,-6);});
  it("hidden retainer month trails appear once under the visible parent",()=>{
    const parent={...stage(),id:"retainer",plans:[],budget:99};
    const child={...stage(),parentId:"retainer",trailParentId:"retainer",budget:100};
    const r=calculate([parent,child]);assert.equal(r.people.get("retainer")?.[0]?.weeks[0]?.logged,8);assert.equal(r.people.has("s"),false);assert.equal(r.totals.get("retainer")?.cost,240);assert.equal(r.totals.get("retainer")?.budget,100);
  });
  it("project-only imports keep weekly dates and person attribution",()=>{const r=calculate([stage()],[entry({stageId:null,imported:true})]);assert.equal(r.people.get("project")?.[0]?.id,"r");assert.equal(r.people.get("project")?.[0]?.weeks[0]?.logged,8);assert.equal(r.people.get("project")?.[0]?.weeks[0]?.imported,8);});
});
describe("approved exact budget warning thresholds",()=>{
  it("exactly 10 points ahead is green",()=>assert.equal(actualBudgetBand(50,100,50,40),"normal"));
  it("more than 10 points ahead is amber",()=>assert.equal(actualBudgetBand(50.01,100,50.01,40),"ahead"));
  it("cost equal to budget is not red",()=>assert.equal(actualBudgetBand(100,100,100,100),"normal"));
  it("cost over budget is red and takes priority over amber",()=>assert.equal(actualBudgetBand(100.01,100,100.01,10),"over"));
  it("zero budget with positive cost is red and no dates cannot trigger amber",()=>{assert.equal(actualBudgetBand(1,0,null,null),"over");assert.equal(actualBudgetBand(50,100,50,null),"normal");});
});