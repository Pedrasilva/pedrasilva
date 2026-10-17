import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeBusinessPerformance,entryFigures,type BPEntry} from '../src/lib/reports/business-performance';
import {computeCompanyHealth,type HealthInput} from '../src/lib/reports/company-health';
const e:BPEntry={user_id:'tatiana',task_id:null,entry_date:'2026-10-12',hours:8,billable:false,entry_type:'internal',cost_rate_snapshot:14.18,cost_rate_source:'overhead_salary'};
test('salary-only internal analysis preserves hours and excludes duplicate business cost',()=>{
 const r=computeBusinessPerformance({entries:[e],ratesFor:()=>({saleRate:99,costRate:99}),capacityHours:8});
 assert.equal(r.cost,0);assert.equal(r.capacityUsedHours,8);assert.equal(entryFigures(e,{saleRate:99,costRate:99})?.cost,113.44);
});
test('Backoffice internal cost is an overhead analysis, not an extra waterfall cost',()=>{
 const input={start:'2026-10-12',end:'2026-10-12',roster:[{userId:'tatiana',collaboratorId:'c',resourceId:'r',name:'Tatiana',dailyHours:8,daysPerWeek:5,startDate:null}],entries:[{...e,internal_category:'Backoffice',opportunity_id:null,leave_type:null,non_working_day_reason:null,approval_status:null}],leaveDays:[],holidays:new Set<string>(),fullCost:200,targetOf:()=>null,isBackOffice:()=>true,ratesFor:()=>({saleRate:0,costRate:0}),costRateAt:()=>0,projectOf:()=>null,isOwnWork:()=>false,lostLeads:new Set<string>()} as unknown as HealthInput;
 const r=computeCompanyHealth(input);assert.equal(r.money.fullCost,200);assert.equal(r.money.blocks.internal,0);assert.equal(r.money.blocks.estrutura,200);assert.equal(r.lossPeople['i:Backoffice']?.[0]?.cost,113.44);assert.equal(r.lossPeople['i:Backoffice']?.[0]?.overhead,true);
});
