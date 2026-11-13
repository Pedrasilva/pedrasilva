import {describe,it,expect} from 'vitest';
import {typographyVariables,PSA_BRAND_TYPOGRAPHY} from '../src/lib/psa-proposal/typography';
describe('proposal typography contract',()=>{
  it('uses the agreed body size and paragraph rhythm by default',()=>{
    const vars=typographyVariables({});
    expect(vars['--psa-body-size']).toBe('10.5pt');
    expect(vars['--psa-paragraph-gap']).toBe('calc(var(--psa-body-size) * 0.75)');
  });
  it('projects every edited typography setting into the same document variables',()=>{
    expect(typographyVariables({headingFont:'Manrope',bodyFont:'Inter',headingWeight:500,bodyAlign:'right',bodySize:12,headingScale:1.2,paragraphGap:0.9})).toEqual({'--psa-heading-font':'Manrope','--psa-body-font':'Inter','--psa-heading-weight':'500','--psa-body-align':'right','--psa-body-size':'12pt','--psa-heading-scale':'1.2','--psa-paragraph-gap':'calc(var(--psa-body-size) * 0.9)'});
  });
  it('reset restores typography without overriding document geometry',()=>expect(PSA_BRAND_TYPOGRAPHY.masterPage).toBeUndefined());
});