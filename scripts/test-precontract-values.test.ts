import {describe,it,expect} from 'vitest';
import {calculatorHasConflicts,type CalculatorPreview} from '../src/lib/quotes/calculator-planning';
const preview:CalculatorPreview={revision:'1',hasContract:false,existing:[],manual:[{id:'phase',name:'Phase',sort_order:1}],removed:[],paymentDefaults:null};
describe('D50 precontract calculator values',()=>{
 it('a manual value override before contract needs no confirmation',()=>expect(calculatorHasConflicts(preview)).toBe(false));
 it('contracted manual overrides stay protected',()=>expect(calculatorHasConflicts({...preview,hasContract:true})).toBe(true));
 it('structural removals still require review before contract',()=>expect(calculatorHasConflicts({...preview,removed:[{id:'removed',name:'Removed',sort_order:2}]})).toBe(true));
 it('existing unrelated stages still require replace/add review',()=>expect(calculatorHasConflicts({...preview,existing:[{id:'existing',name:'Existing',sort_order:2}]})).toBe(true));
});