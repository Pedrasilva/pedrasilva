import { describe, it, expect } from "vitest";
import { generateByStageBilling, generateStageMilestones, generateArchitectureWithConsultants, actualPaymentDate } from "../src/lib/quotes/payment-generators";
import type { QuoteStage } from "../src/lib/quotes/types";
const stages = [3950,9450,12300,5280].map((budget,i) => ({ id: `s${i}`, name: `Phase ${i}`, budget, sort_order:i,
  start_date:"2000-01-03",end_date:"2000-03-24",stage_kind:i===3 ? "retainer_monthly":"regular",
  stage_billing_timing:i===0?"start":"split", retainer_months:4,retainer_monthly_amount:1320,retainer_anchor_month:"2027-04-01"
})) as QuoteStage[];
const fees = {s0:3950,s1:9450,s2:12300,s3:5280};
const plan = {enabled:true,rows:[{label:"FT01",stageId:null,trigger:"project_start" as const,percent:10},
  ...[0,1,2].map(i=>({label:`FT0${i+2}`,stageId:`s${i}`,trigger:"stage_end" as const,percent:30}))]};
describe("design subtotal milestone generation",()=>{
  it("uses 25700 design fees at 10/30/30/30 plus four unchanged assistance months",()=>{
    const items=generateByStageBilling(stages,fees,{designMilestones:plan,downPaymentPercent:10,deductDownPaymentFromStages:false});
    expect(items.map(i=>i.amount_value)).toEqual([2570,7710,7710,7710,1320,1320,1320,1320]);
    expect(items.reduce((sum,i)=>sum+i.amount_value,0)).toBe(30980);
    expect(items.slice(1,4).map(i=>i.trigger_type)).toEqual(["stage_end","stage_end","stage_end"]);
  });
  it("leaves unset design calendar dates null without dropping the advance or assistance anchors",()=>{
    const items=generateByStageBilling(stages,fees,{designMilestones:plan});
    expect(items.slice(0,4).map(i=>i.expected_invoice_date)).toEqual([null,null,null,null]);
    expect(items.slice(4).map(i=>i.expected_invoice_date)).toEqual(["2027-04-01","2027-05-01","2027-06-01","2027-07-01"]);
  });
  it("uses actual Gantt calendar dates when available",()=>{
    const dated=stages.map(s=>({...s,start_date:"2026-11-02",end_date:"2026-12-01"}));
    expect(generateByStageBilling(dated,fees,{designMilestones:plan}).slice(0,4).map(i=>i.expected_invoice_date)).toEqual(["2026-11-02","2026-12-01","2026-12-01","2026-12-01"]);
  });
  it("rejects milestone percentages which would change the contract total",()=>{
    expect(()=>generateByStageBilling(stages,fees,{designMilestones:{...plan,rows:plan.rows.map(r=>({...r,percent:25.1}))}})).toThrow();
  });
  it("rejects a removed milestone phase",()=>{
    expect(()=>generateByStageBilling(stages,fees,{designMilestones:{...plan,rows:plan.rows.map((r,i)=>i===1?{...r,stageId:"removed"}:r)}})).toThrow();
  });
  it("deducts generic advance proportionally from design only even with a legacy false switch",()=>{
    const items=generateByStageBilling(stages,fees,{downPaymentPercent:10,deductDownPaymentFromStages:false});
    expect(items[0].amount_value).toBe(2570);
    expect(items.filter(i=>i.stage_id==="s0").reduce((sum,i)=>sum+i.amount_value,0)).toBe(3555);
    expect(items.filter(i=>i.stage_id==="s3").map(i=>i.amount_value)).toEqual([1320,1320,1320,1320]);
    expect(items.reduce((sum,i)=>sum+i.amount_value,0)).toBe(30980);
  });
  it("keeps other generators inclusive and non-negative for unequal phase fees",()=>{
    const design=stages.slice(0,3);
    const milestones=generateStageMilestones(design,{downPaymentEnabled:true,downPaymentPercent:10,stageStartPercent:50,stageEndPercent:50,stageFees:fees,totalFee:25700,deductDownPaymentFromStages:false});
    expect(milestones.reduce((sum,i)=>sum+i.amount_value,0)).toBe(25700);
    expect(milestones.every(i=>i.amount_value>=0)).toBe(true);
    expect(generateArchitectureWithConsultants(design,[],fees,{downPaymentPercent:10}).reduce((sum,i)=>sum+i.amount_value,0)).toBe(25700);
  });
  it("has no supplier lines when engineers have been removed",()=>{
    expect(generateByStageBilling(stages,fees,{designMilestones:plan,externalServices:[]}).filter(i=>i.direction==="outflow")).toEqual([]);
  });
  it("never accepts relative or sentinel dates as actual invoice dates",()=>{
    expect(actualPaymentDate("2000-01-03")).toBeNull();
    expect(actualPaymentDate(null)).toBeNull();
  });
});