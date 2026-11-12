import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useHourBudgets} from '@/lib/projects/use-hour-budgets';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Save,RotateCcw} from 'lucide-react';
export function HourBudgetPanel({projectId,stageId,editable=false}:{projectId:string;stageId?:string;editable?:boolean}){
 const {t,i18n}=useTranslation('projects');const q=useHourBudgets(projectId);const project=q.data?.[0];const row=stageId?project?.stages.find(s=>s.id===stageId):undefined;const hours=stageId?row?.hours:project?.total;
 const [manual,setManual]=useState('');const qc=useQueryClient();const save=useMutation({mutationFn:async(value:number|null)=>{const r=await supabase.rpc('pm_set_hours_target',{_project:projectId,_stage:(stageId??null) as unknown as string,_hours:value as number});if(r.error)throw r.error;},onSuccess:()=>qc.invalidateQueries({queryKey:['project-hour-budgets']})});
 if(!hours)return null;const num=(n:number|null)=>n==null?'—':new Intl.NumberFormat(i18n.language,{maximumFractionDigits:1}).format(n);
 return <section className="space-y-2 border-b border-border px-3 py-3" data-hour-budget={stageId??projectId}>
  <div className="flex flex-wrap justify-between gap-2 text-xs"><span>{t('glossary:time.plannedHours')}: {hours.planned==null?t(`hourBudget.${hours.origin==='rateMissing'?'rateMissing':'feeMissing'}`):`${num(hours.planned)} ${t('common:units.hoursShort')}`} {hours.origin==='estimate'&&t('hourBudget.estimate')}</span><span>{t('glossary:time.loggedHours')}: {num(hours.used)} {t('common:units.hoursShort')}</span><span>{t('hourBudget.remaining')}: {num(hours.remaining)} {t('common:units.hoursShort')}</span></div>
  <div className="h-1.5 overflow-hidden rounded bg-muted"><div className={hours.status==='bad'?'h-full bg-destructive':hours.status==='warn'?'h-full bg-warning':'h-full bg-primary'} style={{width:`${hours.planned!=null&&hours.planned>0?Math.min(100,hours.used/hours.planned*100):0}%`}}/></div>
  {row?.financial&&<div className="flex justify-between text-xs"><span>{t('hourBudget.spent')}: {row.financial.spent==null?'—':new Intl.NumberFormat(i18n.language,{style:'currency',currency:'EUR'}).format(row.financial.spent)}</span><span>{t('hourBudget.remaining')}: {row.financial.remaining==null?'—':new Intl.NumberFormat(i18n.language,{style:'currency',currency:'EUR'}).format(row.financial.remaining)}</span></div>}
  {editable&&<div className="flex items-end gap-1"><div><Label className="text-xs">{t('hourBudget.target')}</Label><Input type="number" min={0} value={manual} onChange={e=>setManual(e.target.value)} className="h-7"/></div><Button size="icon" variant="ghost" title={t('common:save')} disabled={save.isPending||manual===''||!Number.isFinite(Number(manual))||Number(manual)<0} onClick={()=>save.mutate(Number(manual))}><Save className="h-4 w-4"/></Button><Button size="icon" variant="ghost" title={t('hourBudget.reset')} disabled={save.isPending} onClick={()=>save.mutate(null)}><RotateCcw className="h-4 w-4"/></Button></div>}
  {save.error&&<p className="text-xs text-destructive">{save.error.message}</p>}
 </section>;
}