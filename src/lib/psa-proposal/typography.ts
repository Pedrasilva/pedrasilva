import type { PsaProposalStyleSettings } from './types';

export const PSA_BRAND_TYPOGRAPHY: PsaProposalStyleSettings = {
  headingFont: '"The Future", "Inter", "Helvetica Neue", Arial, sans-serif',
  bodyFont: '"Signifier", "Source Serif 4", Georgia, serif',
  headingWeight: 700, bodyAlign: 'justify', bodySize: 10.5, headingScale: 1,
  paragraphGap: 0.75,
};
export function typographyVariables(settings: PsaProposalStyleSettings): Record<string,string> {
  const s={...PSA_BRAND_TYPOGRAPHY,...settings};
  return {
    '--psa-heading-font':s.headingFont??PSA_BRAND_TYPOGRAPHY.headingFont??'',
    '--psa-body-font':s.bodyFont??PSA_BRAND_TYPOGRAPHY.bodyFont??'',
    '--psa-heading-weight':String(s.headingWeight??700), '--psa-body-align':s.bodyAlign??'justify',
    '--psa-body-size':`${s.bodySize??10.5}pt`, '--psa-heading-scale':String(s.headingScale??1),
    '--psa-paragraph-gap':`calc(var(--psa-body-size) * ${s.paragraphGap??0.75})`,
  };
}
export async function proposalFontAvailable(font: string): Promise<boolean> {
  const family=font.split(',')[0]?.trim().replace(/^['"]|['"]$/g,'');
  if (!family) return false;
  try {
    const faces=await document.fonts.load(`14px "${family}"`);
    return faces.length>0;
  } catch { return false; }
}