import { translateError } from '@/lib/translate-error';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { CalendarClock, ExternalLink, RefreshCw, Send } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { scheduleInstagram } from '@/lib/marketing/instagram.functions';
import { lisbonParts, lisbonToUtcIso } from '@/lib/marketing/calendar';
import { useDraftApprovalState } from '@/lib/marketing/use-draft-approval-state';

export function InstagramPublishControls({ draftId, status, canCurate, error, permalink, sentAt }: { draftId:string;status:string;canCurate:boolean;error?:string|null;permalink?:string|null;sentAt?:string|null }) {
 const {t}=useTranslation('marketing');const {isAdmin}=useAuth();const qc=useQueryClient();const schedule=useServerFn(scheduleInstagram);
 const approval=useDraftApprovalState(draftId);
 const [mode,setMode]=useState<'schedule'|'now'|null>(null);const [busy,setBusy]=useState(false);
 const defaults=lisbonParts(new Date(Date.now()+3600000).toISOString());
 const [date,setDate]=useState(defaults.date);const [time,setTime]=useState(defaults.time);
 const refresh=()=>{for(const key of ['marketing-calendar','marketing-posts','instagram-feed'])void qc.invalidateQueries({queryKey:[key]});};
 const act=async(now:boolean)=>{setBusy(true);try{const r=await schedule({data:{draftId,at:now?new Date().toISOString():lisbonToUtcIso(date,time),now}});if(r.unavailable)toast.error(t('publishing.connectionUnavailable'));else toast.success(t(now?'publishing.requested':'calendar.scheduledToast'));setMode(null);refresh();}catch(e){toast.error(e instanceof Error?translateError(e.message):t('posts.error'));}finally{setBusy(false);}};
 const actionable=['approved','scheduled','failed'].includes(status)&&!sentAt&&approval.data?.valid_approval===true;
 return <div className="space-y-2">
  <Badge variant={status==='failed'?'destructive':'secondary'}>{t(`posts.status.${status}`)}</Badge>
  {error&&<p className="text-xs text-destructive">{translateError(error)}</p>}
  {permalink&&<a href={permalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary underline"><ExternalLink className="h-3 w-3"/>{t('publishing.openInstagram')}</a>}
  <div className="flex flex-wrap gap-2">
   {canCurate&&actionable&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>setMode('schedule')}><CalendarClock className="mr-1 h-3.5 w-3.5"/>{t('calendar.schedulePublish')}</Button>}
   {canCurate&&status==='failed'&&actionable&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>{setDate(lisbonParts(new Date().toISOString()).date);setTime(lisbonParts(new Date().toISOString()).time);setMode('schedule');}}><RefreshCw className="mr-1 h-3.5 w-3.5"/>{t('publishing.retry')}</Button>}
   {isAdmin&&canCurate&&actionable&&<Button size="sm" disabled={busy} onClick={()=>setMode('now')}><Send className="mr-1 h-3.5 w-3.5"/>{t('publishing.now')}</Button>}
  </div>
  <Dialog open={!!mode} onOpenChange={v=>{if(!v&&!busy)setMode(null);}}><DialogContent><DialogHeader><DialogTitle>{t(mode==='now'?'publishing.now':'calendar.setTime')}</DialogTitle></DialogHeader>
   {mode==='now'?<p className="text-sm">{t('publishing.confirmNow')}</p>:<><div className="grid grid-cols-2 gap-2"><div><Label>{t('calendar.date')}</Label><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div><Label>{t('calendar.time')}</Label><Input type="time" value={time} onChange={e=>setTime(e.target.value)}/></div></div><p className="text-xs text-muted-foreground">{t('calendar.tzHint')}</p></>}
   <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setMode(null)}>{t('common:cancel')}</Button><Button disabled={busy||!date||!time} onClick={()=>void act(mode==='now')}>{t(mode==='now'?'publishing.now':'calendar.schedulePublish')}</Button></DialogFooter>
  </DialogContent></Dialog>
 </div>;
}