import {describe,it,expect} from 'vitest';
import {defaultTemplateSelection,replacedSections,type TemplatePreview} from './full-template';
describe('quote template section selection',()=>{
 it('selects all five sections and fee values by default',()=>{expect(defaultTemplateSelection).toEqual({planning:true,fees:true,payments:true,blocks:true,layout:true,feeValues:true});});
 it('warns only for selected populated sections',()=>{const p:TemplatePreview={version:2,revision:'fixture',counts:{planning:36,fees:55,payments:91,blocks:39,layout:1},existing:{planning:1,fees:1,payments:0,blocks:2,layout:0}};expect(replacedSections(p,{...defaultTemplateSelection,fees:false})).toEqual(['planning','blocks']);});
 it('does not warn of overwritten content in a blank quote',()=>{const p:TemplatePreview={version:2,revision:'fixture',counts:{planning:36,fees:55,payments:91,blocks:39,layout:1},existing:{planning:0,fees:0,payments:0,blocks:0,layout:0}};expect(replacedSections(p,defaultTemplateSelection)).toEqual([]);});
});