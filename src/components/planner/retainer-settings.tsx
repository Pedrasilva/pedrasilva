import {useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {supabase} from '@/integrations/supabase/client';
import {changeGanttStage} from '@/lib/projects/gantt-schedule';
import {retainerEnd} from '@/lib/projects/retainer-schedule';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog';
import {toast} from '@/lib/toast';
import {useQuoteCommercial} from '@/lib/quotes/use-quote-commercial';
import {useGanttCommercial} from '@/lib/projects/use-gantt-commercial';
export interface RetainerSettingsStage {id:string;start_date:string;retainer_months?:number|null;retainer_monthly_amount?:number|null;is_fee_only?:boolean|null}
export function RetainerSettings({stage,scope,operational=false,readOnly=false,onMonthlyChange}:{stage:RetainerSettingsStage;scope:string;operational?:boolean;readOnly?:boolean;onMonthlyChange?:(value:number)=>void}){
 const {t}=useTranslation('crm');const qc=useQueryClient();const [pending,setPending]=useState<number|null>(null);const [reason,setReason]=useState('');const [agreed,setAgreed]=useState(false);const [responsibility,setResponsibility]=useState(false);
 const commercial=useQuoteCommercial(scope,!operational);
 const projectCommercial=useGanttCommercial(scope,operational);
 const protectedValue=operational?projectCommercial.data?.hasContract!==false:commercial.data?.hasContract!==false;
 const save=useMutation({mutationFn:async(input:{months?:number;feeOnly?:boolean;value?:number})=>{
  if(readOnly)return;
  if(input.months!==undefined)await changeGanttStage(operational?'project':'quote',scope,stage.id,stage.start_date,retainerEnd(stage.start_date,input.months));
  if(input.feeOnly!==undefined){const {error}=await supabase.from(operational?'pm_stages':'quote_stages').update({is_fee_only:input.feeOnly}).eq('id',stage.id);if(error)throw error;}
  if(input.value!==undefined){const {error}=operational?await supabase.rpc('pm_gantt_change_value',{_stage:stage.id,_expected:Number(stage.retainer_monthly_amount??0),_value:input.value,_reason:reason,_responsibility:responsibility,_client_agreed:agreed}):await supabase.rpc('quote_retainer_change_value',{_stage:stage.id,_expected:Number(stage.retainer_monthly_amount??0),_value:input.value,_reason:reason,_responsibility:responsibility,_client_agreed:agreed});if(error)throw error;}
 },onSuccess:async()=>{setPending(null);await Promise.all(['quote-stages','quote-payment-schedule','quote-financials','psa-live-quote','pm-project','pm-stages-all','pm-incoming-timing','billing-plan'].map(key=>qc.invalidateQueries({queryKey:[key]})));},onError:error=>toast.error(error.message)});
 return <div className="space-y-3" data-retainer-settings={stage.id}>
  <p className="text-xs font-medium text-primary">{t('workspace.planning.retainerMonthly.badge')}</p>
  <div><Label htmlFor={`retainer-months-${stage.id}`}>{t('workspace.planning.retainerMonthly.duration')}</Label><Input id={`retainer-months-${stage.id}`} aria-label={t('workspace.planning.retainerMonthly.duration')} key={`months-${stage.id}-${stage.retainer_months}`} type="number" min={1} max={120} defaultValue={stage.retainer_months??12} disabled={readOnly||save.isPending} onBlur={e=>{const months=Number(e.target.value);if(Number.isInteger(months)&&months>0&&months<=120&&months!==stage.retainer_months)save.mutate({months});}}/></div>
  <div><Label htmlFor={`retainer-amount-${stage.id}`}>{t('workspace.planning.retainerMonthly.monthlyAmount')}</Label><Input id={`retainer-amount-${stage.id}`} aria-label={t('workspace.planning.retainerMonthly.monthlyAmount')} key={`value-${stage.id}-${stage.retainer_monthly_amount}`} type="number" min={0} defaultValue={stage.retainer_monthly_amount??0} disabled={readOnly||save.isPending||!operational&&!commercial.isSuccess} onBlur={e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=0&&value!==Number(stage.retainer_monthly_amount??0)){if(!protectedValue)save.mutate({value});else if(operational)onMonthlyChange?.(value);else{setPending(value);setReason('');setAgreed(false);setResponsibility(false);}}}}/></div>
  <div className="flex items-center gap-2"><Switch id={`retainer-only-${stage.id}`} checked={stage.is_fee_only??true} disabled={readOnly||save.isPending} onCheckedChange={feeOnly=>save.mutate({feeOnly})}/><Label htmlFor={`retainer-only-${stage.id}`}>{t('workspace.planning.retainerMonthly.feeOnly')}</Label></div>
  {pending!==null&&<Dialog open onOpenChange={open=>{if(!open)setPending(null);}}><DialogContent><DialogHeader><DialogTitle>{t('projects:commercial.confirmTitle')}</DialogTitle></DialogHeader><label className="flex gap-2"><Checkbox checked={agreed} onCheckedChange={v=>setAgreed(v===true)}/>{t('projects:commercial.clientAgreed')}</label><label className="flex gap-2"><Checkbox checked={responsibility} onCheckedChange={v=>setResponsibility(v===true)}/>{t('projects:commercial.takeResponsibility')}</label><Label htmlFor="retainer-reason">{t('projects:commercial.reason')}</Label><Input id="retainer-reason" value={reason} onChange={e=>setReason(e.target.value)}/><DialogFooter><Button variant="outline" onClick={()=>setPending(null)}>{t('common:cancel')}</Button><Button disabled={!agreed||!responsibility||reason.trim().length<3||save.isPending} onClick={()=>save.mutate({value:pending})}>{t('common:confirm')}</Button></DialogFooter></DialogContent></Dialog>}
 </div>;
}