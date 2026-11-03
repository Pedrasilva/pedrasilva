import {describe,it,expect} from 'vitest';
import {canOpenProjectTab, type ProjectViewerAreas} from '../src/lib/projects/project-area-tabs';
const access:ProjectViewerAreas={active:true,financials:true,budget_cost:false,expenses:false,supplier_fees:false};
describe('project area access',()=>{
  it('keeps cutover OFF without changing existing access',()=>{expect(canOpenProjectTab('expenses',{...access,active:false})).toBe(true)});
  it('Financials does not grant Expenses',()=>{expect(canOpenProjectTab('incoming',access)).toBe(true);expect(canOpenProjectTab('expenses',access)).toBe(false)});
  it('combined payment plan needs both financial and supplier areas',()=>{expect(canOpenProjectTab('paymentSchedule',access)).toBe(false);expect(canOpenProjectTab('paymentSchedule',{...access,supplier_fees:true})).toBe(true)});
  it('pending authorization never renders a financial deep link',()=>{expect(canOpenProjectTab('incoming')).toBe(false)});
});