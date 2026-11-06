import {describe,it,expect} from 'vitest';
import {sortInvoiceQueue,type IssueRow} from '../src/lib/finance/invoices-to-issue';
import {pursuitByProject} from '../src/lib/projects/use-pursuit';
import {marginPercentage} from '../src/lib/projects/financial-calculation';
describe('invoice urgency',()=>{
 const row=(id:string,date:string|null,construction=false)=>({id,project_id:id,planned_invoice_date:date,stage_id:id,project_stages:[{id,name:construction?'Retainer':'Design',sort_order:construction?1:10}]} as IssueRow);
 it('keeps earliest dates first across projects even for construction',()=>expect(sortInvoiceQueue([row('b','2026-11-06'),row('a','2026-11-01',true)]).map(r=>r.id)).toEqual(['a','b']));
 it('puts construction last on equal dates and missing dates last',()=>expect(sortInvoiceQueue([row('a','2026-11-06',true),row('b','2026-11-06'),row('c',null)]).map(r=>r.id)).toEqual(['b','a','c']));
});
describe('Budget pursuit contribution',()=>{
 const pursuit=[{project_id:'qa',resource_id:null,hours:1,snapshot_cost:47.99,hours_without_snapshot:0}];
 it('all ON includes the 48-euro displayed cost once and reconciles profit 1274 rounded / 41%',()=>{
 const cost=1763.775+(pursuitByProject(pursuit,()=>undefined,undefined).get('qa')?.cost??NaN);
 expect(cost).toBe(1811.765);expect(Math.round(3085.875-cost)).toBe(1274);expect(Math.round(marginPercentage(3085.875,3085.875-cost)??NaN)).toBe(41);
 });
 it('hidden Budget never becomes zero',()=>expect(Number.isNaN(pursuitByProject([{...pursuit[0],snapshot_cost:NaN,hours_without_snapshot:NaN}],()=>undefined,undefined).get('qa')?.cost)).toBe(true));
 it('partial and all OFF have no integrated margin',()=>{expect(marginPercentage(3085.875,1274.1,[true,false,true,true])).toBeNull();expect(marginPercentage(3085.875,1274.1,[false,false,false,false])).toBeNull()});
 it('zero revenue has no margin',()=>expect(marginPercentage(0,-48)).toBeNull());
});
