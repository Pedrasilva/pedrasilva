import {describe,it,expect} from 'vitest';
import {canOpenProjectTab, type ProjectViewerAreas} from '../src/lib/projects/project-area-tabs';
const access:ProjectViewerAreas={active:true,financials:true,budget_cost:false,expenses:false,supplier_fees:false};
describe('project area access',()=>{
  it('keeps cutover OFF without changing existing access',()=>{expect(canOpenProjectTab('expenses',{...access,active:false})).toBe(true)});
  it('Financials does not grant Expenses',()=>{expect(canOpenProjectTab('incoming',access)).toBe(true);expect(canOpenProjectTab('expenses',access)).toBe(false)});
  it('combined payment plan needs both financial and supplier areas',()=>{expect(canOpenProjectTab('paymentSchedule',access)).toBe(false);expect(canOpenProjectTab('paymentSchedule',{...access,supplier_fees:true})).toBe(true)});
  it('pending authorization never renders a financial deep link',()=>{expect(canOpenProjectTab('incoming')).toBe(false)});
  it('Billing read follows only project Financials, independently of Finance module access',()=>{expect(canOpenProjectTab('billing',access)).toBe(true);expect(canOpenProjectTab('billing',{...access,financials:false})).toBe(false)});
  it('Financials gates every financial sibling without a global Finance prerequisite',()=>{for(const tab of ['financial','architecture','incoming','financialSummary']){expect(canOpenProjectTab(tab,access)).toBe(true);expect(canOpenProjectTab(tab,{...access,financials:false})).toBe(false)}});
});