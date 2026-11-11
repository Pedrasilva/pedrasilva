import {describe,it,expect} from 'vitest';
import {allocateCalculatorFee} from './fee-calculator';
describe('calculator stage amounts',()=>{
 it('whole euro stage amounts sum exactly to the final 151956 euro fee',()=>{
 const amounts=allocateCalculatorFee(151956,[.1,.3,.2,.3,.1]);
 expect(amounts).toEqual([15196,45586,30391,45587,15196]);expect(amounts.reduce((n,s)=>n+s,0)).toBe(151956);
 });
});
