import {describe,it,expect} from 'vitest';
import {typographyVariables,PSA_BRAND_TYPOGRAPHY} from '../src/lib/psa-proposal/typography';
import {PSA_TEXT_SPACING, resolveTextSpacing, textSpacingVariables} from '../src/lib/psa-proposal/text-spacing';
describe('master text spacing',()=>{
  it('uses the approved PSA body and paragraph defaults',()=>{expect(PSA_TEXT_SPACING.bodyLeading).toBe(1.4);expect(PSA_TEXT_SPACING.paragraphSpace).toBe(6);});
  it('uses independent list rhythm defaults',()=>{expect(PSA_TEXT_SPACING.listLeading).toBe(1.4);expect(PSA_TEXT_SPACING.listItemSpace).toBe(3);expect(PSA_TEXT_SPACING.listBefore).toBe(3);expect(PSA_TEXT_SPACING.listAfter).toBe(6);});
  it('uses approved heading defaults',()=>{expect([PSA_TEXT_SPACING.h2Before,PSA_TEXT_SPACING.h2After]).toEqual([18,6]);expect([PSA_TEXT_SPACING.h3Before,PSA_TEXT_SPACING.h3After]).toEqual([12,4]);});
  it('inherits master and ignores disabled overrides',()=>expect(resolveTextSpacing({paragraphSpace:8},{paragraphSpace:17},false).paragraphSpace).toBe(8));
  it('preserves explicit overrides across master changes',()=>expect(resolveTextSpacing({paragraphSpace:8},{paragraphSpace:17},true).paragraphSpace).toBe(17));
  it('reset restores current master not original PSA values',()=>expect(resolveTextSpacing({listItemSpace:9},undefined,false).listItemSpace).toBe(9));
  it('paragraph adjustments do not alter list spacing',()=>{const s=resolveTextSpacing({paragraphSpace:18});expect(s.listItemSpace).toBe(3);expect(textSpacingVariables(s)['--psa-paragraph-gap']).toBe('18pt');});
});
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