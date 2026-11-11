import type { PsaProposalStyleSettings } from './types';

export type MasterLogo = { alignment: 'left' | 'centre' | 'right'; x: number; y: number; width: number };
export type MasterPage = {
  version: 1;
  pageTypes?: { cover: PageTypeLayout; letter: PageTypeLayout };
  margins: { top: number; bottom: number; left: number; right: number };
  header: { show: boolean; height: number };
  footer: { show: boolean; height: number; address: string; fontSize: number };
  logo: MasterLogo;
  contact: { x: number; y: number; width: number; email: string; website: string };
  firstPage?: { enabled: boolean; showHeader: boolean; showFooter: boolean; logo: MasterLogo };
};
export type PageTypeLayout = { margins: MasterPage['margins']; logo: MasterLogo; bodyY: number; signatureWidth: number };
export function typeLayout(master: MasterPage, type: 'cover'|'letter'): PageTypeLayout {
  return master.pageTypes?.[type] ?? {margins:type==='cover'?{top:0,bottom:0,left:0,right:0}:{top:22,bottom:22,left:24,right:24},logo:{...master.logo},bodyY:type==='cover'?70:35,signatureWidth:45};
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

export function masterVariables(m: MasterPage): Record<string, string> {
  return {
    '--psa-margin-top': `${m.margins.top}mm`, '--psa-margin-bottom': `${m.margins.bottom}mm`,
    '--psa-margin-left': `${m.margins.left}mm`, '--psa-margin-right': `${m.margins.right}mm`,
    '--psa-header-height': `${m.header.height}mm`, '--psa-footer-height': `${m.footer.height}mm`,
    '--psa-logo-x': `${m.logo.x}mm`, '--psa-logo-y': `${m.logo.y}mm`,
    '--psa-logo-transform': m.logo.alignment === 'right' ? 'translateX(-100%)' : m.logo.alignment === 'centre' ? 'translateX(-50%)' : 'none',
    '--psa-logo-width': m.logo.width ? `${m.logo.width}mm` : 'auto', '--psa-logo-height': m.logo.width ? 'auto' : '14mm',
    '--psa-contact-x': `${m.contact.x}mm`, '--psa-contact-y': `${m.contact.y}mm`, '--psa-contact-width': `${m.contact.width}mm`,
    '--psa-footer-size': `${m.footer.fontSize}pt`, '--psa-footer-bottom': '6mm',
  };
}

export function validMaster(m: MasterPage): boolean {
  const finite = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
  return Object.values(m.margins).every(v => finite(v, 100)) && m.margins.left + m.margins.right < 200 && m.margins.top + m.margins.bottom < 280
    && finite(m.header.height, 100) && finite(m.footer.height, 100)
    && [m.logo, ...(m.firstPage?.enabled ? [m.firstPage.logo] : [])].every(l => finite(l.x, 210) && finite(l.y, 297) && finite(l.width, 200))
    && finite(m.contact.x, 210) && finite(m.contact.y, 297) && m.contact.width > 0 && finite(m.contact.width, 200)
    && m.footer.fontSize >= 5 && m.footer.fontSize <= 24;
}