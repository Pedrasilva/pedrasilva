import {describe,it,expect} from 'vitest';
import {stripProjectMoney} from './safe-project-rows.functions';
describe('hours-only data boundary',()=>{
 it('never sends money or rates in nested resources/entries',()=>{const safe=stripProjectMoney({id:'s',budget:100000,allocations:[{resource:{cost_rate:50,hourly_rate:75,name:'PSA'},hours_per_day:8}],sale_rate_snapshot:75});expect(safe).toEqual({id:'s',allocations:[{resource:{name:'PSA'},hours_per_day:8}]});});
});