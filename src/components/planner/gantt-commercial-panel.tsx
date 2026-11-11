import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {History,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog';
import {formatMoney} from '@/lib/product-ui-format';
import {toast} from '@/lib/toast';
import {buildStageNumberMap,formatStageLabel} from '@/lib/quotes/stage-numbering';
import {splitBalance,commercialProjectValue} from '@/lib/projects/gantt-commercial';
import {useGanttCommercial,useGanttValueHistory,useGanttValueActions,type CommercialReference} from '@/lib/projects/use-gantt-commercial';
import type {StageWithAllocations} from '@/lib/projects/types';

export function GanttValueDialog({projectId,stage,value,onClose}:{projectId:string;stage:StageWithAllocations;value:number;onClose:()=>void}){
 const {t}=useTranslation('projects');const actions=useGanttValueActions(projectId);const ref=useGanttCommercial(projectId);
 const reference=ref.data?.stages.find(s=>s.id===stage.id);
 const retainer=stage.stage_kind==='retainer_monthly';
 const [reason,setReason]=useState('');const [responsibility,setResponsibility]=useState(false);const [clientAgreed,setClientAgreed]=useState(false);
 const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
 const confirm=async()=>{try{await actions.change.mutateAsync({id:stage.id,expected:retainer?Number(stage.retainer_monthly_amount):Number(stage.budget),value,reason,responsibility,clientAgreed,effectiveMonth:retainer?`${month}-01`:undefined});onClose();}catch(e){toast.error(e instanceof Error?e.message:String(e));}};
 return <Dialog open onOpenChange={open=>{if(!open&&!actions.change.isPending)onClose();}}><DialogContent><DialogHeader><DialogTitle>{t('commercial.confirmTitle')}</DialogTitle></DialogHeader>
  <p className="text-sm">{reference?.contracted!=null?t('commercial.responsibilityHint',{value:formatMoney(reference.contracted)}):t('commercial.pendingResponsibilityHint')}</p>
  <p className="font-mono text-sm">{formatMoney(retainer?Number(stage.retainer_monthly_amount):Number(stage.budget))} → {formatMoney(value)}</p>
  {retainer&&<><label className="flex items-start gap-2 text-sm"><Checkbox checked={clientAgreed} onCheckedChange={v=>setClientAgreed(v===true)}/>{t('commercial.clientAgreed')}</label><Label htmlFor="effective-month">{t('commercial.effectiveMonth')}</Label><Input id="effective-month" type="month" min={new Date().toISOString().slice(0,7)} value={month} onChange={e=>setMonth(e.target.value)}/></>}
  <label className="flex items-start gap-2 text-sm"><Checkbox checked={responsibility} onCheckedChange={v=>setResponsibility(v===true)}/>{t('commercial.takeResponsibility')}</label>
  <Label htmlFor="value-reason">{t('commercial.reason')}</Label><Input id="value-reason" maxLength={240} value={reason} onChange={e=>setReason(e.target.value)}/>
  <DialogFooter><Button variant="outline" onClick={onClose} disabled={actions.change.isPending}>{t('common:cancel')}</Button><Button onClick={confirm} disabled={!responsibility||(retainer&&!clientAgreed)||reason.trim().length<3||actions.change.isPending}>{t('common:confirm')}</Button></DialogFooter>
 </DialogContent></Dialog>;
}

export function GanttCommercialHistory({projectId,stages,stageId}:{projectId:string;stages:StageWithAllocations[];stageId?:string}){
 const {t,i18n}=useTranslation('projects');const [open,setOpen]=useState(false);const q=useGanttValueHistory(projectId,open);const numbers=buildStageNumberMap(stages);
 const rows=(q.data??[]).filter(r=>!stageId||r.stage_id===stageId);
 return <><Button variant="ghost" size="sm" onClick={()=>setOpen(true)}><History className="mr-1 h-4 w-4"/>{t('commercial.history')}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[80vh] max-w-3xl overflow-auto"><DialogHeader><DialogTitle>{t('commercial.history')}</DialogTitle></DialogHeader>
  {q.isPending?<p>{t('common:loading')}</p>:q.isError?<p role="alert">{t('commercial.historyUnavailable')}</p>:rows.length===0?<p>{t('commercial.historyEmpty')}</p>:<ol className="divide-y divide-border">{rows.map(r=><li key={r.id} className="space-y-1 py-3 text-sm"><p className="font-semibold">{formatStageLabel({name:r.stage_name},numbers.get(r.stage_id))}</p><p>{r.actor_name} · {new Date(r.changed_at).toLocaleString(i18n.language)}</p><p className="font-mono">{r.old_value==null?'—':formatMoney(r.old_value)} → {formatMoney(r.new_value)}</p><p>{r.reason}</p>{r.effective_month&&<p>{t('commercial.appliesFrom',{month:r.effective_month.slice(0,7)})}</p>}</li>)}</ol>}
 </DialogContent></Dialog></>;
}

export function GanttContractSummary({projectId,stages}:{projectId:string;stages:StageWithAllocations[]}){
 const {t}=useTranslation('projects');const q=useGanttCommercial(projectId);const current=commercialProjectValue(stages);
 return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm" data-contract-totals><div className="flex flex-wrap gap-4"><span>{t('commercial.contracted')}: <strong>{q.data?.contractedTotal==null?t('sharedGantt.referencePending'):formatMoney(q.data.contractedTotal)}</strong></span><span>{t('commercial.current')}: <strong>{Number.isFinite(current)?formatMoney(current):'—'}</strong></span>{q.data?.contractedTotal!=null&&current!==q.data.contractedTotal&&<span className="font-semibold text-destructive">{t('commercial.changed')} · {formatMoney(current-q.data.contractedTotal)}</span>}</div><GanttCommercialHistory projectId={projectId} stages={stages}/></div>;
}

export function GanttStageCommercial({projectId,stage,stages,reference,readOnly,onChange}:{projectId:string;stage:StageWithAllocations;stages:StageWithAllocations[];reference?:CommercialReference;readOnly:boolean;onChange:(value:number)=>void}){
 const {t}=useTranslation('projects');const actions=useGanttValueActions(projectId);const [monthly,setMonthly]=useState(String(stage.retainer_monthly_amount??0));const retainer=stage.stage_kind==='retainer_monthly';
 const children=stages.filter(s=>s.parent_stage_id===stage.id&&s.stage_kind!=='retainer_month');const balance=splitBalance(Number(stage.budget),children.map(s=>Number(s.budget)));
 const extend=async()=>{try{await actions.extend.mutateAsync({id:stage.id,months:1});}catch(e){toast.error(e instanceof Error?e.message:String(e));}};
 return <section className="space-y-2 border-b border-border pb-3 text-xs" data-stage-contract>
  {reference?.outsideContract?<p className="font-semibold text-destructive">{t('commercial.outside')}</p>:reference?.contracted==null?<p className="text-muted-foreground">{t('sharedGantt.referencePending')}</p>:<><p>{t('commercial.contracted')}: {formatMoney(reference.contracted)}</p>{Number(stage.budget)!==reference.contracted&&<p className="font-semibold text-destructive">{t('commercial.changed')} · {formatMoney(reference.contracted)} → {formatMoney(Number(stage.budget))} · {formatMoney(Number(stage.budget)-reference.contracted)}</p>}</>}
  {children.length>0&&<p className={balance.valid?'text-muted-foreground':'text-destructive'}>{t('commercial.splitBalance',{allocated:formatMoney(balance.allocated),remaining:formatMoney(balance.remaining)})}</p>}
  {retainer&&<><Label htmlFor="retainer-value">{t('newRetainerStageDialog.ui.monthlyFeeEuros')}</Label><div className="flex gap-2"><Input id="retainer-value" type="number" min={0} value={monthly} onChange={e=>setMonthly(e.target.value)} disabled={readOnly}/><Button size="sm" variant="outline" disabled={readOnly||!Number.isFinite(Number(monthly))||Number(monthly)<0||Number(monthly)===Number(stage.retainer_monthly_amount)} onClick={()=>onChange(Number(monthly))}>{t('common:edit')}</Button></div><Button size="sm" variant="outline" disabled={readOnly||actions.extend.isPending} onClick={extend}><Plus className="mr-1 h-3 w-3"/>{t('commercial.addMonth')}</Button></>}
  <GanttCommercialHistory projectId={projectId} stages={stages} stageId={stage.id}/>
 </section>;
}