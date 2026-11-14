import type { PsaProposalStyleSettings } from './types';

export type MasterLogo = { alignment: 'left' | 'centre' | 'right'; x: number; y: number; width: number };
export type MasterElement = 'header' | 'logo' | 'contact' | 'footer' | 'footerAddress' | 'footerNumber' | 'footerLogo';
export type MasterPage = {
  version: 1;
  textSpacing?: Partial<import('./text-spacing').TextSpacing>;
  typography?: Pick<PsaProposalStyleSettings,'headingFont'|'bodyFont'|'headingWeight'|'bodyAlign'|'bodySize'|'headingScale'|'paragraphGap'>;
  pageTypes?: { cover: PageTypeLayout; letter: PageTypeLayout };
  margins: { top: number; bottom: number; left: number; right: number };
  header: { show: boolean; height: number; position?: MasterLogo };
  footer: { show: boolean; height: number; address: string; fontSize: number; position?: MasterLogo; addressPosition?: MasterLogo; numberPosition?: MasterLogo; logoPosition?: MasterLogo; showLogo?: boolean; hideOnCover?: boolean; hideOnLetter?: boolean };
  logo: MasterLogo;
  contact: { x: number; y: number; width: number; alignment?: MasterLogo['alignment']; email: string; website: string };
  firstPage?: { enabled: boolean; showHeader: boolean; showFooter: boolean; logo: MasterLogo };
};
export type PageTypeLayout = { margins: MasterPage['margins']; logo: MasterLogo; bodyY: number; signatureWidth: number };
export function typeLayout(master: MasterPage, type: 'cover'|'letter'): PageTypeLayout {
  if (type === 'letter') return {margins:{...master.margins},logo:{...master.logo},bodyY:master.margins.top,signatureWidth:master.pageTypes?.letter.signatureWidth??45};
  return master.pageTypes?.cover ?? {margins:{top:0,bottom:0,left:0,right:0},logo:{...master.logo},bodyY:70,signatureWidth:45};
}

/** Legacy furniture uses its own frame, independently of body margins. No persistence on read. */
export function resolveMaster(s: PsaProposalStyleSettings = {}): MasterPage {
  if (s.masterPage) return s.masterPage;
  return {
    version: 1,
    margins: { top: s.marginTop ?? 34, bottom: s.marginBottom ?? 32, left: s.marginLeft ?? 14, right: s.marginRight ?? 14 },
    header: { show: s.showHeader !== false, height: 22 },
    footer: { show: s.showFooter !== false, height: 26, address: s.footerAddress ?? 'Trav. Corpo Santo 10, 1.ºD\n1200-131 Lisboa, Portugal', fontSize: 8.5 },
    logo: { alignment: 'left', x: 14, y: 8, width: 14 * 1920 / 563 },
    contact: { x: 146, y: 8, width: 50, email: s.headerContactEmail ?? 'info@pedrasilva.com', website: s.headerContactWebsite ?? 'www.pedrasilva.com' },
  };
}

export function logoLeft(logo: MasterLogo, width = logo.width): number {
  return logo.alignment === 'right' ? logo.x - width : logo.alignment === 'centre' ? logo.x - width / 2 : logo.x;
}

export function pageVariant(m: MasterPage, first: boolean): MasterPage {
  const f = m.firstPage;
  return first && f?.enabled ? { ...m, header: { ...m.header, show: f.showHeader }, footer: { ...m.footer, show: f.showFooter }, logo: f.logo } : m;
}

export function snapMm(value: number, guides: number[], tolerance = 1.5): number {
  const guide = guides.find(g => Math.abs(g - value) <= tolerance);
  return Math.round((guide ?? value) * 10) / 10;
}

/** All editable furniture coordinates are page-edge millimetres. Groups translate their children. */
export function masterElement(m: MasterPage, kind: MasterElement): MasterLogo {
  const footer = m.footer;
  const fontMm = footer.fontSize * 25.4 / 72;
  switch (kind) {
    case 'header': return m.header.position ?? {x:0,y:0,width:210,alignment:'left'};
    case 'logo': return m.logo;
    case 'contact': return {...m.contact,alignment:m.contact.alignment ?? 'right'};
    case 'footer': return footer.position ?? {x:14,y:297-6-footer.height,width:182,alignment:'left'};
    case 'footerAddress': return footer.addressPosition ?? {x:0,y:footer.height-fontMm*1.45*Math.max(1,footer.address.split('\n').length),width:152,alignment:'left'};
    case 'footerNumber': return footer.numberPosition ?? {x:152,y:footer.height-fontMm*1.2,width:30,alignment:'right'};
    case 'footerLogo': return footer.logoPosition ?? {x:0,y:0,width:30,alignment:'left'};
  }
}

export function moveMasterElement(m: MasterPage, kind: MasterElement, patch: Partial<MasterLogo>): MasterPage {
  const next = {...masterElement(m,kind),...patch};
  if(kind==='logo') return {...m,logo:next};
  if(kind==='contact') return {...m,contact:{...m.contact,...next}};
  if(kind==='header') return {...m,header:{...m.header,position:next}};
  const key = kind==='footer'?'position':kind==='footerAddress'?'addressPosition':kind==='footerNumber'?'numberPosition':'logoPosition';
  return {...m,footer:{...m.footer,[key]:next}};
}

export function nudgeMasterElement(m: MasterPage, kind: MasterElement, key: string, shift = false): MasterPage {
  const step = (shift ? 10 : 1) * 25.4 / 72;
  const p = masterElement(m,kind);
  return moveMasterElement(m,kind,{x:p.x+(key==='ArrowRight'?step:key==='ArrowLeft'?-step:0),y:p.y+(key==='ArrowDown'?step:key==='ArrowUp'?-step:0)});
}

export function furnitureVariant(m: MasterPage, type: 'content'|'cover'|'letter'): MasterPage {
  return {...m,footer:{...m.footer,show:m.footer.show && !(type==='cover'?(m.footer.hideOnCover??true):type==='letter'?(m.footer.hideOnLetter??false):false)}};
}

export function safeBottomMargin(m: MasterPage): number {
  if (!m.footer.show || !(m.footer.position || m.footer.addressPosition || m.footer.numberPosition || (m.footer.showLogo && m.footer.logoPosition))) return m.margins.bottom;
  const f=masterElement(m,'footer');
  const children = ['footerAddress','footerNumber',...(m.footer.showLogo?['footerLogo']:[])] as MasterElement[];
  const top = Math.min(f.y,...children.map(k=>f.y+masterElement(m,k).y));
  return Math.max(m.margins.bottom,297-top+3);
}

export function masterVariables(m: MasterPage): Record<string, string> {
  const header=masterElement(m,'header'),footer=masterElement(m,'footer');
  const address=masterElement(m,'footerAddress'),number=masterElement(m,'footerNumber'),logo=masterElement(m,'footerLogo');
  return {
    '--psa-margin-top': `${m.margins.top}mm`, '--psa-margin-bottom': `${safeBottomMargin(m)}mm`,
    '--psa-margin-left': `${m.margins.left}mm`, '--psa-margin-right': `${m.margins.right}mm`,
    '--psa-header-height': `${m.header.height}mm`, '--psa-footer-height': `${m.footer.height}mm`,
    '--psa-logo-x': `${m.logo.x}mm`, '--psa-logo-y': `${m.logo.y}mm`,
    '--psa-logo-transform': m.logo.alignment === 'right' ? 'translateX(-100%)' : m.logo.alignment === 'centre' ? 'translateX(-50%)' : 'none',
    '--psa-logo-width': m.logo.width ? `${m.logo.width}mm` : 'auto', '--psa-logo-height': m.logo.width ? 'auto' : '14mm',
    '--psa-header-x': `${header.x}mm`, '--psa-header-y': `${header.y}mm`, '--psa-header-width': `${header.width}mm`,
    '--psa-contact-x': `${m.contact.x}mm`, '--psa-contact-y': `${m.contact.y}mm`, '--psa-contact-width': `${m.contact.width}mm`, '--psa-contact-align': m.contact.alignment??'right',
    '--psa-footer-size': `${m.footer.fontSize}pt`, '--psa-footer-bottom': `${297-footer.y-m.footer.height}mm`,
    '--psa-footer-x':`${footer.x}mm`, '--psa-footer-y':`${footer.y}mm`, '--psa-footer-width':`${footer.width}mm`,
    '--psa-footer-address-x':`${address.x}mm`, '--psa-footer-address-y':`${address.y}mm`, '--psa-footer-address-width':`${address.width}mm`, '--psa-footer-address-align':address.alignment,
    '--psa-footer-number-x':`${number.x}mm`, '--psa-footer-number-y':`${number.y}mm`, '--psa-footer-number-width':`${number.width}mm`, '--psa-footer-number-align':number.alignment,
    '--psa-footer-logo-x':`${logo.x}mm`, '--psa-footer-logo-y':`${logo.y}mm`, '--psa-footer-logo-width':`${logo.width}mm`, '--psa-footer-logo-align':logo.alignment,
  };
}

export function validMaster(m: MasterPage): boolean {
  const finite = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
  return Object.values(m.margins).every(v => finite(v, 100)) && m.margins.left + m.margins.right < 200 && m.margins.top + m.margins.bottom < 280
    && finite(m.header.height, 100) && finite(m.footer.height, 100)
    && [m.logo, ...(m.firstPage?.enabled ? [m.firstPage.logo] : [])].every(l => finite(l.x, 210) && finite(l.y, 297) && finite(l.width, 200))
    && finite(m.contact.x, 210) && finite(m.contact.y, 297) && m.contact.width > 0 && finite(m.contact.width, 200)
    && m.footer.fontSize >= 5 && m.footer.fontSize <= 24
    && (['header','footer','footerAddress','footerNumber','footerLogo'] as MasterElement[]).every(k=>{const p=masterElement(m,k);return finite(p.x,297)&&finite(p.y,297)&&p.width>0&&finite(p.width,210);});
}