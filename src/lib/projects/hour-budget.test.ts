import {describe,it,expect} from 'vitest';
import {hourBudget,hoursStatus,defaultSale,stageHourBudgets,type BudgetStage} from './hour-budget';
describe('approved fee hour rules',()=>{
 it('50 percent markup',()=>expect(defaultSale(100)).toBe(150));
 it('100000 fee at 100 per hour is 1000 hours',()=>expect(hourBudget(100000,100,75).planned).toBe(1000));
 it('manual hour budget wins',()=>expect(hourBudget(100000,100,75,250).remaining).toBe(175));
 it('fee missing is not zero',()=>expect(hourBudget(0,100,75).planned).toBeNull());
 it('rate missing is not free',()=>expect(hourBudget(100000,null,75).origin).toBe('rateMissing'));
 it('amber begins at 85 percent',()=>{expect(hoursStatus(100,84.99)).toBe('ok');expect(hoursStatus(100,85)).toBe('warn');});
 it('red only above planned',()=>{expect(hoursStatus(100,100)).toBe('warn');expect(hoursStatus(100,100.01)).toBe('bad');});
 it('monthly retainer counted once in its summary',()=>{
  const base:BudgetStage={id:'r',parent_stage_id:null,budget:24000,stage_kind:'retainer_monthly',is_self:true,commercial_value_owned:false,planned_hours_target:null,retainer_monthly_amount:2000,retainer_months:12};
  const rows=stageHourBudgets([base,{...base,id:'m',parent_stage_id:'r',budget:2000,stage_kind:'retainer_month'}],100,new Map([['m',10]]));expect(rows.get('r')?.planned).toBe(240);expect(rows.get('m')?.planned).toBe(20);expect(rows.get('r')?.used).toBe(10);
 });
});