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
import { resolveMaster, pageVariant, masterVariables, snapMm, validMaster, type MasterPage, type MasterLogo, typeLayout, masterElement, moveMasterElement, nudgeMasterElement, furnitureVariant, safeBottomMargin, type MasterElement } from '@/lib/psa-proposal/master-page';
import { useMasterDefault, useSaveMasterDefault } from '@/lib/psa-proposal/use-master-page';
import { useUpdateProposal } from '@/lib/psa-proposal/use-psa-proposal';
import type { PsaProposal } from '@/lib/psa-proposal/types';
import { TextSpacingControls } from './text-spacing-controls';
import { resolveTextSpacing, textSpacingVariables } from '@/lib/psa-proposal/text-spacing';
import { useQueryClient } from '@tanstack/react-query';

export function MasterPageEditor({ initial, onSave, onReset, onPreview, previewHtml, saving = false, customized = false }: { initial: MasterPage; onSave: (m: MasterPage) => Promise<unknown>; onReset?: () => void; onPreview?: (m: MasterPage) => void; previewHtml?: string; saving?: boolean; customized?: boolean }) {
  const { t } = useTranslation('common');
  const [m, setM] = useState(() => structuredClone(initial));
  const [pageType,setPageType]=useState<'content'|'cover'|'letter'>('content');
  const [first, setFirst] = useState(false);
  const [selected,setSelected]=useState<MasterElement>('footer');
  const [zoom, setZoom] = useState('1');
  const sheet = useRef<HTMLDivElement>(null);
  const layout=pageType==='cover'?typeLayout(m,'cover'):null;
  const current = furnitureVariant(layout?{...m,margins:layout.margins,logo:layout.logo,header:{...m.header,show:false}}:pageVariant(m, first),pageType);
  const selectedPosition=masterElement(current,selected);
  const patchElement=(kind:MasterElement,p:Partial<MasterLogo>)=>kind==='logo'?patchLogo(p):setM(prev=>moveMasterElement(prev,kind,p));
  const patchLayout=(patch:Partial<NonNullable<typeof layout>>)=>{if(pageType==='content')return;setM(prev=>({...prev,pageTypes:{cover:typeLayout(prev,'cover'),letter:typeLayout(prev,'letter'),[pageType]:{...typeLayout(prev,pageType),...patch}}}));};
  const patchLogo = (p: Partial<MasterLogo>) => layout?patchLayout({logo:{...layout.logo,...p}}):setM(prev => first && prev.firstPage?.enabled ? { ...prev, firstPage: { ...prev.firstPage, logo: { ...prev.firstPage.logo, ...p } } } : { ...prev, logo: { ...prev.logo, ...p } });
  const field = (key: string, value: number, change: (v: number) => void, unit = 'mm') => <div className="space-y-1"><Label htmlFor={`master-${key}`}>{t(`masterPage.${key}`)} ({unit})</Label><Input id={`master-${key}`} type="number" step="0.1" value={Math.round(value * 100) / 100} onChange={e => change(Number(e.target.value))} /></div>;
  function startDrag(event: React.PointerEvent<HTMLElement>, kind: MasterElement, resize = false) {
    const bounds = sheet.current?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault(); event.stopPropagation(); setSelected(kind);
    const node=event.currentTarget; node.setPointerCapture(event.pointerId);
    const x=event.clientX,y=event.clientY,origin=masterElement(current,kind);
    const parent=kind.startsWith('footer')&&kind!=='footer'?masterElement(current,'footer'):kind==='logo'||kind==='contact'?masterElement(current,'header'):{x:0,y:0};
    const move=(e:PointerEvent)=>{
      const dx=(e.clientX-x)*210/bounds.width,dy=(e.clientY-y)*297/bounds.height;
      if(resize){patchElement(kind,{width:Math.max(2,Math.min(210,snapMm(origin.width+dx,[current.margins.left-parent.x-origin.x,210-current.margins.right-parent.x-origin.x])))});return;}
      const nextX=snapMm(origin.x+parent.x+dx,[0,current.margins.left,210-current.margins.right,105,210-current.margins.right-origin.width])-parent.x;
      const nextY=snapMm(origin.y+parent.y+dy,[current.margins.top,297-current.margins.bottom,0,297-current.footer.height])-parent.y;
      patchElement(kind,{x:Math.max(0,Math.min(210-origin.width,nextX)),y:Math.max(0,Math.min(297,nextY))});
    };
    const end=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',end);node.removeEventListener('pointercancel',end);if(node.hasPointerCapture(event.pointerId))node.releasePointerCapture(event.pointerId);};
    node.addEventListener('pointermove',move);node.addEventListener('pointerup',end);node.addEventListener('pointercancel',end);
  }
  const selectable=(kind:MasterElement)=>({tabIndex:0,'data-master-element':kind,'data-selected':selected===kind,'aria-label':t(`masterPage.elements.${kind}`),onPointerDown:(e:React.PointerEvent<HTMLElement>)=>startDrag(e,kind),onFocus:()=>setSelected(kind),onKeyDown:(e:React.KeyboardEvent<HTMLElement>)=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();setM(prev=>nudgeMasterElement(prev,kind,e.key,e.shiftKey));}});
  const resizeHandle=(kind:MasterElement)=><span role="slider" tabIndex={0} aria-label={t('masterPage.resizeElement',{element:t(`masterPage.elements.${kind}`)})} aria-valuenow={masterElement(current,kind).width} className="master-resize-handle" onPointerDown={e=>startDrag(e,kind,true)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();patchElement(kind,{width:Math.max(2,masterElement(current,kind).width+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1)*25.4/72)});}}/>;
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
        <div ref={sheet} className="master-sheet proposal-print-document proposal-master-document" style={{ ...masterVariables(current), ...textSpacingVariables(resolveTextSpacing(m.textSpacing)), transform: `scale(${zoom})` }}>
          <div className="master-margin-guides" style={{ top: `${current.margins.top}mm`, bottom: `${safeBottomMargin(current)}mm`, left: `${current.margins.left}mm`, right: `${current.margins.right}mm` }} />
          {previewHtml&&pageType==='content'&&<div className="master-text-preview" style={{top:`${current.margins.top}mm`,left:`${current.margins.left}mm`,right:`${current.margins.right}mm`,bottom:`${safeBottomMargin(current)}mm`}} dangerouslySetInnerHTML={{__html:previewHtml}}/>}
          <div className="master-header-guide" style={{ height: `${m.header.height}mm` }} /><div className="master-footer-guide" style={{ height: `${m.footer.height}mm` }} />
          {current.header.show && <div className="proposal-page-header master-draggable" {...selectable('header')}>
            {resizeHandle('header')}<div role="img" className="proposal-letterhead-brand master-draggable" {...selectable('logo')}><img draggable={false} src={psaLogo.url} className="proposal-letterhead-logo" alt="Pedra Silva" />{resizeHandle('logo')}</div>
            <div role="group" className="proposal-letterhead-contact master-draggable" {...selectable('contact')}>{pageType==='letter'?m.footer.address.split('\n').map((line,index)=><div key={index}>{line}</div>):<><div>{m.contact.email}</div><div>{m.contact.website}</div></>}{resizeHandle('contact')}</div>
          </div>}
          {current.footer.show && <div className="proposal-page-footer master-draggable" {...selectable('footer')}>
            {resizeHandle('footer')}<div className="proposal-page-address whitespace-pre-line master-draggable" {...selectable('footerAddress')}>{m.footer.address}{resizeHandle('footerAddress')}</div>
            <div className="proposal-footer-number master-draggable" {...selectable('footerNumber')}>1 / 11{resizeHandle('footerNumber')}</div>
            {m.footer.showLogo&&<div className="proposal-footer-logo master-draggable" {...selectable('footerLogo')}><img draggable={false} src={psaLogo.url} alt="Pedra Silva"/>{resizeHandle('footerLogo')}</div>}
          </div>}

        </div>
      </div></div>
      <div className="master-controls space-y-4">
        <section className="space-y-2 border-b pb-3">
          <Label>{t('masterPage.selectedElement')}</Label><Select value={selected} onValueChange={v=>setSelected(v as MasterElement)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{(['header','logo','contact','footer','footerAddress','footerNumber','footerLogo'] as MasterElement[]).map(k=><SelectItem key={k} value={k}>{t(`masterPage.elements.${k}`)}</SelectItem>)}</SelectContent></Select>
          <div className="grid grid-cols-2 gap-2">{field('elementX',selectedPosition.x,x=>patchElement(selected,{x}))}{field('elementY',selectedPosition.y,y=>patchElement(selected,{y}))}</div>
          {field('elementWidth',selectedPosition.width,width=>patchElement(selected,{width}))}
          <Label>{t('masterPage.alignment')}</Label><Select value={selectedPosition.alignment} onValueChange={alignment=>patchElement(selected,{alignment:alignment as MasterLogo['alignment']})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{(['left','centre','right'] as const).map(a=><SelectItem key={a} value={a}>{t(`masterPage.align.${a}`)}</SelectItem>)}</SelectContent></Select>
          {selected==='footer'&&field('footerDistance',297-selectedPosition.y-m.footer.height,distance=>patchElement('footer',{y:297-distance-m.footer.height}))}
          <div className="flex items-center justify-between"><Label>{t('masterPage.showFooterLogo')}</Label><Switch checked={m.footer.showLogo??false} onCheckedChange={showLogo=>setM(prev=>({...prev,footer:{...prev.footer,showLogo}}))}/></div>
          {(['cover','letter'] as const).map(type=><div key={type} className="flex items-center justify-between"><Label>{t(`masterPage.hideFooter.${type}`)}</Label><Switch checked={type==='cover'?(m.footer.hideOnCover??true):(m.footer.hideOnLetter??false)} onCheckedChange={hide=>setM(prev=>({...prev,footer:{...prev.footer,[type==='cover'?'hideOnCover':'hideOnLetter']:hide}}))}/></div>)}
        </section>

        <TextSpacingControls value={resolveTextSpacing(m.textSpacing)} onChange={textSpacing=>{const next={...m,textSpacing};setM(next);onPreview?.(next);}}/>
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

export function ProposalMasterButton({ proposal, readOnly = false, compactClassName }: { proposal: PsaProposal; readOnly?: boolean; compactClassName?: string }) {
  const { t } = useTranslation('common'); const [open, setOpen] = useState(false);
  const update = useUpdateProposal(proposal.id); const defaults = useMasterDefault();
  const [previewHtml,setPreviewHtml]=useState('');
  const qc=useQueryClient();
  const preview=(master:MasterPage)=>qc.setQueryData<PsaProposal>(['psa-proposal',proposal.id],prev=>prev?{...prev,style_settings:{...prev.style_settings,textSpacing:master.textSpacing,textSpacingOverride:true}}:prev);
  const close=(next:boolean)=>{if(next){const blocks=Array.from(document.querySelectorAll('.proposal-canvas-edit .proposal-print-block[data-page-type="content"]'));setPreviewHtml(blocks.find(b=>b.querySelector('p')&&b.querySelector('li'))?.outerHTML??blocks.find(b=>b.querySelector('p'))?.outerHTML??'');}setOpen(next);if(!next)void qc.invalidateQueries({queryKey:['psa-proposal',proposal.id]});};
  const save = async (master: MasterPage, customized = true) => { const changed=JSON.stringify(master.textSpacing)!==JSON.stringify(resolveTextSpacing(defaults.data?.template.textSpacing,proposal.style_settings.textSpacing,proposal.style_settings.textSpacingOverride)); await update.mutateAsync({ style_settings: { ...proposal.style_settings, textSpacing:customized?(changed?master.textSpacing:proposal.style_settings.textSpacing):undefined,textSpacingOverride:customized?(changed||proposal.style_settings.textSpacingOverride===true):false, pageTypesEnabled:true, masterPage: master, masterRevision: defaults.data?.revision ?? 0, masterCustomized: customized } }); close(false); };
  return <><Button className={compactClassName} variant="outline" size="sm" disabled={readOnly} onClick={() => close(true)}><LayoutTemplate className="mr-2 h-4 w-4" />{t('masterPage.title')}</Button><Dialog open={open} onOpenChange={close}><DialogContent className="master-dialog"><DialogHeader><DialogTitle>{t('masterPage.title')}</DialogTitle></DialogHeader>{open && <MasterPageEditor previewHtml={previewHtml} initial={{...resolveMaster(proposal.style_settings),textSpacing:resolveTextSpacing(defaults.data?.template.textSpacing,proposal.style_settings.textSpacing,proposal.style_settings.textSpacingOverride)}} onPreview={preview} customized={proposal.style_settings.masterCustomized !== false} saving={update.isPending} onSave={m => save(m)} onReset={defaults.data ? () => void save(defaults.data.template, false).catch(e => toast.error(e.message)) : undefined} />}</DialogContent></Dialog></>;
}

export function PracticeMasterPage() {
  const defaults = useMasterDefault(); const save = useSaveMasterDefault(); const { t } = useTranslation('common');
  if (!defaults.data) return <div role="status">{defaults.error ? defaults.error.message : t('loading')}</div>;
  return <MasterPageEditor key={defaults.data.revision} initial={defaults.data.template} saving={save.isPending} onSave={async m => { await save.mutateAsync({ template: m, revision: defaults.data.revision }); toast.success(t('masterPage.saved')); }} />;
}