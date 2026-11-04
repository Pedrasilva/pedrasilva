import {describe,it,expect} from 'vitest';
import {permittedNumber,permittedMargin,unavailableNumbers} from '../src/lib/projects/b1-projection';
describe('B1 financial projection rules',()=>{
  it('never represents a hidden value as zero',()=>{
    expect(Number.isNaN(permittedNumber(6000,false))).toBe(true);
    expect(permittedNumber(0,true)).toBe(0);
    const row=unavailableNumbers({budget:null,allocations:[{resource:{cost_rate:null}}]});
    expect(Number.isNaN(row.budget)).toBe(true);
    expect(Number.isNaN(row.allocations[0]?.resource.cost_rate)).toBe(true);
  });
  it('requires every contributing area for margins',()=>{
    for(let denied=0;denied<4;denied++){
      expect(permittedMargin(100,60,[0,1,2,3].map(i=>i!==denied))).toBeNull();
    }
    expect(permittedMargin(100,60,[true,true,true,true])).toBe(0.4);
  });
  it('suppresses margins when any value is missing',()=>{
    expect(permittedMargin(100,null,[true,true,true,true])).toBeNull();
    expect(permittedMargin(null,60,[true,true,true,true])).toBeNull();
  });
});