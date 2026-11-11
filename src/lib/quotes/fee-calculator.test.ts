import {describe,it,expect} from 'vitest';
import {computeFeeCalculator,parseFeeCalculatorPayload} from './fee-calculator';
describe('calculator stage amounts',()=>{
 it('whole euro stage amounts sum exactly to the final 151956 euro fee',()=>{
 const r=computeFeeCalculator(parseFeeCalculatorPayload({area:930,costPerSqm:2700,category:3,heritageUplift:.3,stages:[.1,.3,.2,.3,.1].map((percentage,i)=>({name:String(i),percentage}))}));
 expect(r.finalFee).toBe(151956);expect(r.stageBreakdown.map(s=>s.amount)).toEqual([15196,45586,30391,45587,15196]);expect(r.stageBreakdown.reduce((n,s)=>n+s.amount,0)).toBe(151956);
 });
});
