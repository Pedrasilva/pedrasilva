import {useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog';
import {toast} from '@/lib/toast';
export function QuoteValueDialog({stageId,expected,value,onClose}:{stageId:string;expected:number;value:number;onClose:()=>void}){
 const {t}=useTranslation('projects');const qc=useQueryClient();const [reason,setReason]=useState('');const [responsibility,setResponsibility]=useState(false);
 const save=useMutation({mutationFn:async()=>{const {error}=await supabase.rpc('quote_gantt_change_value',{_stage:stageId,_expected:expected,_value:value,_reason:reason,_responsibility:responsibility});if(error)throw error;},onSuccess:async()=>{await qc.invalidateQueries();onClose();},onError:e=>toast.error(e.message)});
 return <Dialog open onOpenChange={open=>{if(!open&&!save.isPending)onClose();}}><DialogContent><DialogHeader><DialogTitle>{t('commercial.confirmTitle')}</DialogTitle></DialogHeader><label className="flex gap-2"><Checkbox checked={responsibility} onCheckedChange={v=>setResponsibility(v===true)}/>{t('commercial.takeResponsibility')}</label><Label htmlFor="quote-value-reason">{t('commercial.reason')}</Label><Input id="quote-value-reason" value={reason} maxLength={240} onChange={e=>setReason(e.target.value)}/><DialogFooter><Button variant="outline" onClick={onClose}>{t('common:cancel')}</Button><Button disabled={!responsibility||reason.trim().length<3||save.isPending} onClick={()=>save.mutate()}>{t('common:confirm')}</Button></DialogFooter></DialogContent></Dialog>;
}