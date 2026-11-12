import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Label} from '@/components/ui/label';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {PlanningReplacementWarning} from './planning-replacement-warning';
import type {CalculatorPreview} from '@/lib/quotes/calculator-planning';
export function CalculatorApplyDialog({preview,pending,onCancel,onApply}:{preview:CalculatorPreview|null;pending:boolean;onCancel:()=>void;onApply:(action:string,overwrite:boolean,remove:boolean)=>void}) {
 const {t}=useTranslation('crm');const [action,setAction]=useState('cancel');const [overwrite,setOverwrite]=useState(false);const [remove,setRemove]=useState(false);
 return <Dialog open={!!preview} onOpenChange={v=>{if(!v)onCancel();}}><DialogContent><DialogHeader><DialogTitle>{t('feeCalculator.applyToFee')}</DialogTitle><DialogDescription>{t('quoteTemplate.relativeHint')}</DialogDescription></DialogHeader>
 {preview && <><PlanningReplacementWarning sections={action==='replace'?[t('quoteTemplate.planning'),t('quoteTemplate.fees')]:[]}/>
 {preview.existing.length>0 && <><p className="text-sm">{preview.existing.map(r=>`${r.sort_order} ${r.name}`).join(', ')}</p><RadioGroup value={action} onValueChange={setAction}>{(['replace','add'] as const).map(a=><Label className="flex gap-2 items-center" key={a}><RadioGroupItem value={a}/>{t(`feeCalculator.planning.${a}`)}</Label>)}</RadioGroup></>}
 {preview.hasContract===true&&preview.manual.length>0 && <Label className="flex gap-2 items-start"><Checkbox checked={overwrite} onCheckedChange={v=>setOverwrite(v===true)}/><span>{t('feeCalculator.planning.overwriteManual',{stages:preview.manual.map(r=>`${r.sort_order} ${r.name}`).join(', ')})}</span></Label>}
 {preview.removed.length>0 && <><p className="text-sm">{t('feeCalculator.planning.removed',{stages:preview.removed.map(r=>`${r.sort_order} ${r.name}`).join(', ')})}</p><Label className="flex gap-2 items-center"><Checkbox checked={remove} onCheckedChange={v=>setRemove(v===true)}/>{t('feeCalculator.planning.deleteLinked')}</Label></>}
 </>}
 <DialogFooter><Button variant="ghost" onClick={onCancel} disabled={pending}>{t('common:cancel')}</Button><Button disabled={pending||!!preview?.existing.length&&action==='cancel'||preview?.hasContract===true&&!!preview.manual.length&&!overwrite} onClick={()=>onApply(action,overwrite,remove)}>{t('quoteTemplate.confirm')}</Button></DialogFooter></DialogContent></Dialog>;
}
