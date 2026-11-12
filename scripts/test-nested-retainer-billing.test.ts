import {it,expect} from 'vitest';
import {generateByStageBilling} from '../src/lib/quotes/payment-generators';
import type {QuoteStage} from '../src/lib/quotes/types';
it('construction nested retainer bills twelve full 3000 monthly instalments separately from tender',()=>{
 const stages=[
  {id:'architecture',name:'Architecture',parent_stage_id:null,children_bill_independently:true,budget:0},
  {id:'construction',name:'Construction',parent_stage_id:'architecture',budget:0},
  {id:'tender',name:'Tender',parent_stage_id:'construction',budget:3500,stage_billing_timing:'split'},
  {id:'retainer',name:'Retainer',parent_stage_id:'construction',stage_kind:'retainer_monthly',billing_model:'retainer',retainer_months:12,retainer_monthly_amount:3000,retainer_anchor_month:'2000-09-01',budget:36000},
 ].map((s,i)=>({...s,sort_order:i*10,start_date:'2000-09-01',end_date:'2001-08-31',stage_kind:'regular',billing_model:'stage',...s})) as QuoteStage[];
 const payments=generateByStageBilling(stages,{tender:3500,retainer:36000},{downPaymentPercent:20});
 const monthly=payments.filter(p=>p.stage_id==='retainer');
 expect(monthly).toHaveLength(12);expect(monthly.every(p=>p.amount_value===3000)).toBe(true);
 expect(monthly.reduce((s,p)=>s+p.amount_value,0)).toBe(36000);
 expect(payments.reduce((s,p)=>s+p.amount_value,0)).toBe(39500);
 expect(payments.some(p=>p.stage_id==='construction')).toBe(false);
});