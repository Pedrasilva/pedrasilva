import {useState} from 'react';
import {useQuery,useMutation} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {toast} from '@/lib/toast';
export function CalculatorPaymentDefaults(){
 const {t}=useTranslation('crm');const [start,setStart]=useState('');const [end,setEnd]=useState('');
 const access=useQuery({queryKey:['calculator-defaults-access'],queryFn:async()=>{const r=await supabase.from('quote_planning_defaults').select('*').maybeSingle();if(r.error)throw Error(r.error.message);return r.data;}});
 const save=useMutation({mutationFn:async()=>{const a=Number(start),b=Number(end);if(start===''||end===''||a<0||b<0||a+b!==100)throw Error(t('workspace.payment.errorStageSplit'));const r=await supabase.from('quote_planning_defaults').upsert({id:true,stage_start_percent:a,stage_end_percent:b,updated_at:new Date().toISOString()});if(r.error)throw Error(r.error.message);},onSuccess:()=>{access.refetch();toast.success(t('feeCalculator.planning.defaultsSaved'));},onError:(e:Error)=>toast.error(e.message)});
 return <div className="flex flex-wrap items-end gap-3 border-t pt-3"><div><Label>{t('workspace.payment.stageStartPercent')}</Label><Input type="number" min="0" max="100" className="w-24" value={start} placeholder={String(access.data?.stage_start_percent??'')} onChange={e=>setStart(e.target.value)}/></div><div><Label>{t('workspace.payment.stageEndPercent')}</Label><Input type="number" min="0" max="100" className="w-24" value={end} placeholder={String(access.data?.stage_end_percent??'')} onChange={e=>setEnd(e.target.value)}/></div><Button variant="outline" disabled={save.isPending} onClick={()=>save.mutate()}>{t('feeCalculator.planning.saveDefaults')}</Button></div>;
}
export function CalculatorUndefinedPlan({quoteId}:{quoteId:string}){
 const {t}=useTranslation('crm');const q=useQuery({queryKey:['calculator-undefined-plan',quoteId],queryFn:async()=>{
 const st=await supabase.from('quote_stages').select('id').eq('quote_id',quoteId).eq('calculator_payment_unconfigured',true);if(st.error)throw Error(st.error.message);if(!st.data.length)return false;
 const pay=await supabase.from('quote_payment_schedule_items').select('stage_id').eq('quote_id',quoteId).eq('direction','inflow');if(pay.error)throw Error(pay.error.message);const defined=new Set(pay.data.map(r=>r.stage_id));return st.data.some(r=>!defined.has(r.id));
 }});return q.data?<p className="text-sm text-destructive" role="status">{t('feeCalculator.planning.undefinedPlan')}</p>:null;
}
