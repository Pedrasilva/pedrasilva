import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutTemplate, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogHeader } from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import psaLogo from '@/assets/logotipo-psa.jpg.asset.json';
import { resolveMaster, pageVariant, masterVariables, snapMm, validMaster, type MasterPage, type MasterLogo, typeLayout } from '@/lib/psa-proposal/master-page';
import { useMasterDefault, useSaveMasterDefault } from '@/lib/psa-proposal/use-master-page';
import { useUpdateProposal } from '@/lib/psa-proposal/use-psa-proposal';
import type { PsaProposal } from '@/lib/psa-proposal/types';

export function MasterPageEditor({ initial, onSave, onReset, saving = false, customized = false }: { initial: MasterPage; onSave: (m: MasterPage) => Promise<unknown>; onReset?: () => void; saving?: boolean; customized?: boolean }) {
  const { t } = useTranslation('common');
  const [m, setM] = useState(() => structuredClone(initial));
  const [pageType,setPageType]=useState<'content'|'cover'|'letter'>('content');
  const [first, setFirst] = useState(false);
  const [zoom, setZoom] = useState('1');
  const sheet = useRef<HTMLDivElement>(null);
  const layout=pageType==='content'?null:typeLayout(m,pageType);
  const current = layout?{...m,margins:layout.margins,logo:layout.logo,header:{...m.header,show:pageType==='letter'},footer:{...m.footer,show:false}}:pageVariant(m, first);
  const patchLayout=(patch:Partial<NonNullable<typeof layout>>)=>{if(pageType==='content')return;setM(prev=>({...prev,pageTypes:{cover:typeLayout(prev,'cover'),letter:typeLayout(prev,'letter'),[pageType]:{...typeLayout(prev,pageType),...patch}}}));};
  const patchLogo = (p: Partial<MasterLogo>) => layout?patchLayout({logo:{...layout.logo,...p}}):setM(prev => first && prev.firstPage?.enabled ? { ...prev, firstPage: { ...prev.firstPage, logo: { ...prev.firstPage.logo, ...p } } } : { ...prev, logo: { ...prev.logo, ...p } });
  const field = (key: string, value: number, change: (v: number) => void, unit = 'mm') => <div className="space-y-1"><Label htmlFor={`master-${key}`}>{t(`masterPage.${key}`)} ({unit})</Label><Input id={`master-${key}`} type="number" step="0.1" value={Math.round(value * 100) / 100} onChange={e => change(Number(e.target.value))} /></div>;
  function startDrag(event: React.PointerEvent<HTMLDivElement>, kind: 'logo' | 'contact') {
    const bounds = sheet.current?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const x = event.clientX, y = event.clientY;
    const origin = kind === 'logo' ? current.logo : current.contact;
    const node = event.currentTarget;
    const move = (e: PointerEvent) => {
      const nextX = snapMm(Math.max(0, Math.min(210, origin.x + (e.clientX - x) * 210 / bounds.width)), [m.margins.left, 210 - m.margins.right, 105]);
      const nextY = snapMm(Math.max(0, Math.min(297, origin.y + (e.clientY - y) * 297 / bounds.height)), [m.margins.top, 297 - m.margins.bottom, 8]);
      if (kind === 'logo') patchLogo({ x: nextX, y: nextY });
      else setM(prev => ({ ...prev, contact: { ...prev.contact, x: nextX, y: nextY } }));
    };
    const end = () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', end); node.removeEventListener('pointercancel', end); };
    node.addEventListener('pointermove', move); node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end);
  }
  return <div className="master-editor">
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      {(['cover','letter','content'] as const).map(type=><Button key={type} variant={pageType===type?'default':'outline'} onClick={()=>{setPageType(type);setFirst(false);}}>{t(`letter.${type==='letter'?'title':type}`)}</Button>)}
      <Button variant={!first ? 'default' : 'outline'} onClick={() => setFirst(false)}>{t('masterPage.allPages')}</Button>
      <Button variant={first ? 'default' : 'outline'} onClick={() => setFirst(true)}>{t('masterPage.firstPage')}</Button>
      <Select value={zoom} onValueChange={setZoom}><SelectTrigger className="w-24" aria-label={t('masterPage.zoom')}><SelectValue /></SelectTrigger><SelectContent>{['0.5','0.75','1'].map(v => <SelectItem key={v} value={v}>{Number(v)*100}%</SelectItem>)}</SelectContent></Select>
      <span className="ml-auto text-sm text-muted-foreground">{t(customized ? 'masterPage.customized' : 'masterPage.practiceDefault')}</span>
    </div>
    <div className="master-workspace">
      <div className="master-sheet-scroll"><div className="master-sheet-size" style={{ width: `${210 * Number(zoom)}mm`, height: `${297 * Number(zoom)}mm` }}>
        <div ref={sheet} className="master-sheet proposal-print-document proposal-master-document" style={{ ...masterVariables(current), transform: `scale(${zoom})` }}>
          <div className="master-margin-guides" style={{ top: `${m.margins.top}mm`, bottom: `${m.margins.bottom}mm`, left: `${m.margins.left}mm`, right: `${m.margins.right}mm` }} />
          <div className="master-header-guide" style={{ height: `${m.header.height}mm` }} /><div className="master-footer-guide" style={{ height: `${m.footer.height}mm` }} />
          {current.header.show && <div className="proposal-page-header"><div role="img" aria-label={t('masterPage.logo')} className="proposal-letterhead-brand master-draggable" onPointerDown={e => startDrag(e, 'logo')}><img draggable={false} src={psaLogo.url} className="proposal-letterhead-logo" alt="Pedra Silva" /></div><div role="group" aria-label={t('masterPage.contact')} className="proposal-letterhead-contact master-draggable" onPointerDown={e => startDrag(e, 'contact')}><div>{m.contact.email}</div><div>{m.contact.website}</div></div></div>}
          {current.footer.show && <div className="proposal-page-footer"><div className="proposal-page-address whitespace-pre-line">{m.footer.address}</div><div>1 / 11</div></div>}
        </div>
      </div></div>
      <div className="master-controls space-y-4">
        {layout&&<><h3>{t('masterPage.margins')}</h3><div className="grid grid-cols-2 gap-2">{(['top','bottom','left','right'] as const).map(k=><div key={k}>{field(k,layout.margins[k],v=>patchLayout({margins:{...layout.margins,[k]:v}}))}</div>)}</div><Label>{t('letter.bodyY')}</Label><Input type="number" value={layout.bodyY} onChange={e=>patchLayout({bodyY:Number(e.target.value)})}/><Label>{t('letter.signatureWidth')}</Label><Input type="number" value={layout.signatureWidth} onChange={e=>patchLayout({signatureWidth:Number(e.target.value)})}/></>}
        {first && <div className="flex items-center justify-between"><Label>{t('masterPage.useFirstPage')}</Label><Switch checked={m.firstPage?.enabled ?? false} onCheckedChange={enabled => setM(prev => ({ ...prev, firstPage: { enabled, showHeader: prev.firstPage?.showHeader ?? prev.header.show, showFooter: prev.firstPage?.showFooter ?? prev.footer.show, logo: prev.firstPage?.logo ?? { ...prev.logo } } }))} /></div>}
        <fieldset disabled={first && !m.firstPage?.enabled} className="space-y-4">
          {!first && <><h3 className="font-semibold">{t('masterPage.margins')}</h3><div className="grid grid-cols-2 gap-2">{(['top','bottom','left','right'] as const).map(k => <div key={k}>{field(k, m.margins[k], v => setM(prev => ({ ...prev, margins: { ...prev.margins, [k]: v } })))}</div>)}</div></>}
          <div className="flex items-center justify-between"><Label>{t('masterPage.showHeader')}</Label><Switch checked={current.header.show} onCheckedChange={show => setM(prev => first && prev.firstPage ? { ...prev, firstPage: { ...prev.firstPage, showHeader: show } } : { ...prev, header: { ...prev.header, show } })} /></div>
          {!first && field('headerHeight', m.header.height, height => setM(prev => ({ ...prev, header: { ...prev.header, height } })))}
          <h3 className="font-semibold">{t('masterPage.logo')}</h3>
          <Label>{t('masterPage.alignment')}</Label><Select value={current.logo.alignment} onValueChange={alignment => patchLogo({ alignment: alignment as MasterLogo['alignment'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(['left','centre','right'] as const).map(a => <SelectItem key={a} value={a}>{t(`masterPage.align.${a}`)}</SelectItem>)}</SelectContent></Select>
          <div className="grid grid-cols-2 gap-2">{field('logoX', current.logo.x, x => patchLogo({ x }))}{field('logoY', current.logo.y, y => patchLogo({ y }))}</div>
          {field('logoWidth', current.logo.width, width => patchLogo({ width }))}
          {!first && <><h3 className="font-semibold">{t('masterPage.contact')}</h3><div className="grid grid-cols-2 gap-2">{field('contactX', m.contact.x, x => setM(prev => ({ ...prev, contact: { ...prev.contact, x } })))}{field('contactY', m.contact.y, y => setM(prev => ({ ...prev, contact: { ...prev.contact, y } })))}</div>{field('contactWidth', m.contact.width, width => setM(prev => ({ ...prev, contact: { ...prev.contact, width } })))}<Label htmlFor="master-email">{t('masterPage.email')}</Label><Input id="master-email" value={m.contact.email} onChange={e => setM(prev => ({ ...prev, contact: { ...prev.contact, email: e.target.value } }))} /><Label htmlFor="master-website">{t('website')}</Label><Input id="master-website" value={m.contact.website} onChange={e => setM(prev => ({ ...prev, contact: { ...prev.contact, website: e.target.value } }))} /></>}
          <div className="flex items-center justify-between"><Label>{t('masterPage.showFooter')}</Label><Switch checked={current.footer.show} onCheckedChange={show => setM(prev => first && prev.firstPage ? { ...prev, firstPage: { ...prev.firstPage, showFooter: show } } : { ...prev, footer: { ...prev.footer, show } })} /></div>
          {!first && <>{field('footerHeight', m.footer.height, height => setM(prev => ({ ...prev, footer: { ...prev.footer, height } })))}<Label htmlFor="master-address">{t('masterPage.address')}</Label><Textarea id="master-address" value={m.footer.address} onChange={e => setM(prev => ({ ...prev, footer: { ...prev.footer, address: e.target.value } }))} />{field('footerFontSize', m.footer.fontSize, fontSize => setM(prev => ({ ...prev, footer: { ...prev.footer, fontSize } })), 'pt')}</>}
        </fieldset>
      </div>
    </div>
    <div className="flex items-center justify-end gap-2 border-t pt-3">{onReset && <Button variant="outline" disabled={saving} onClick={onReset}><RotateCcw className="mr-2 h-4 w-4" />{t('masterPage.reset')}</Button>}<Button disabled={saving || !validMaster(m)} onClick={() => void onSave(m).catch(e => toast.error(e instanceof Error ? e.message : t('error')))}>{t('save')}</Button></div>
  </div>;
}

export function ProposalMasterButton({ proposal, readOnly = false }: { proposal: PsaProposal; readOnly?: boolean }) {
  const { t } = useTranslation('common'); const [open, setOpen] = useState(false);
  const update = useUpdateProposal(proposal.id); const defaults = useMasterDefault();
  const save = async (master: MasterPage, customized = true) => { await update.mutateAsync({ style_settings: { ...proposal.style_settings, pageTypesEnabled:true, masterPage: master, masterRevision: defaults.data?.revision ?? 0, masterCustomized: customized } }); setOpen(false); };
  return <><Button variant="outline" size="sm" disabled={readOnly} onClick={() => setOpen(true)}><LayoutTemplate className="mr-2 h-4 w-4" />{t('masterPage.title')}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="master-dialog"><DialogHeader><DialogTitle>{t('masterPage.title')}</DialogTitle></DialogHeader>{open && <MasterPageEditor initial={resolveMaster(proposal.style_settings)} customized={proposal.style_settings.masterCustomized !== false} saving={update.isPending} onSave={m => save(m)} onReset={defaults.data ? () => void save(defaults.data.template, false).catch(e => toast.error(e.message)) : undefined} />}</DialogContent></Dialog></>;
}

export function PracticeMasterPage() {
  const defaults = useMasterDefault(); const save = useSaveMasterDefault(); const { t } = useTranslation('common');
  if (!defaults.data) return <div role="status">{defaults.error ? defaults.error.message : t('loading')}</div>;
  return <MasterPageEditor key={defaults.data.revision} initial={defaults.data.template} saving={save.isPending} onSave={async m => { await save.mutateAsync({ template: m, revision: defaults.data.revision }); toast.success(t('masterPage.saved')); }} />;
}