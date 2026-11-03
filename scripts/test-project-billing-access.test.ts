import {describe,it,expect} from 'vitest';
import {canMutateProjectBilling} from '../src/lib/finance/project-billing-access';
describe('project Billing fiscal actions',()=>{
  it('project readers cannot issue or edit without Finance module access',()=>{expect(canMutateProjectBilling(false,true,true)).toBe(false)});
  it('Finance module alone does not grant document mutations',()=>{expect(canMutateProjectBilling(true,false,false)).toBe(false)});
  it('retains authorized Finance edit and legacy Finance actions',()=>{expect(canMutateProjectBilling(true,true,false)).toBe(true);expect(canMutateProjectBilling(true,false,true)).toBe(true)});
});