import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Send, CheckCircle2, ExternalLink, FileSignature } from 'lucide-react';
import { toast } from '@/lib/toast';
import { supabase } from '@/integrations/supabase/client';
import type { QuoteStatus } from '@/lib/crm/types';
import type { QuoteLifecycle } from '@/lib/quotes/quote-lifecycle';
export function QuoteWorkflowActions({quoteId,lifecycle,onConvert,onGoToSignature}: {
 quoteId:string; lifecycle:QuoteLifecycle; onConvert:()=>void; onGoToSignature?:()=>void;
 status?:QuoteStatus; hasAccount?:boolean; hasProject?:boolean; companyId?:string|null; defaultContactId?:string|null;
 isConverting?:boolean; isSigned?:boolean; canOverrideSignature?:boolean;
}) {
 const {t}=useTranslation('crm'); const qc=useQueryClient(); const [open,setOpen]=useState(false);
 const [date,setDate]=useState(''); const [note,setNote]=useState(''); const [attachment,setAttachment]=useState<File|null>(null);
 const [selected,setSelected]=useState('');
 const revisions=useQuery({queryKey:['quote-acceptance-revisions',quoteId],enabled:open,queryFn:async()=>{
  const {data:proposals,error:pError}=await supabase.from('psa_proposals').select('id').eq('quote_id',quoteId);if(pError)throw pError;
  const {data,error}=await supabase.from('psa_proposal_snapshots').select('id,rev_number,pdf_filename').in('proposal_id',(proposals??[]).map(p=>p.id)).eq('kind','sent').order('created_at',{ascending:false});if(error)throw error;return data??[];
 }});
 const mutation=useMutation({mutationFn:async()=>{
  let path:string|null=null;
  if(attachment){path=`${quoteId}/acceptance/${crypto.randomUUID()}-${attachment.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error}=await supabase.storage.from('proposal-pdfs').upload(path,attachment);if(error)throw error;}
  const {error}=await supabase.rpc('crm_quote_transition',{_quote:quoteId,_action:'accept',_date:date,_note:note,_snapshot:selected||lifecycle.latestSentSnapshotId||undefined,_attachment:path??undefined});
  if(error){if(path)await supabase.storage.from('proposal-pdfs').remove([path]);throw error;}
 },onSuccess:()=>{setOpen(false);qc.invalidateQueries();toast.success(t('quotes.workflow.toast.approved'));},onError:(e:Error)=>toast.error(e.message)});
 const state=lifecycle.state;
 return <>
  {state==='draft'&&<Button size="sm" onClick={onGoToSignature}><Send className="mr-1 h-4 w-4"/>{t('quotes.workflow.send')}</Button>}
  {state==='sent'&&<Button size="sm" onClick={()=>setOpen(true)}><CheckCircle2 className="mr-1 h-4 w-4"/>{t('quotes.flow.registerAcceptance')}</Button>}
  {state==='approved'&&<Button size="sm" onClick={onGoToSignature}><FileSignature className="mr-1 h-4 w-4"/>{t('quotes.flow.signatureAction')}</Button>}
  {(state==='signed'||state==='converted')&&<Button size="sm" onClick={onConvert}><ExternalLink className="mr-1 h-4 w-4"/>{t(state==='converted'?'quotes.workflow.openProject':'quotes.workflow.convertCta')}</Button>}
  <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{t('quotes.flow.registerAcceptance')}</DialogTitle><DialogDescription>{t('quotes.flow.acceptanceDescription')}</DialogDescription></DialogHeader>
   <Label htmlFor="acceptance-date">{t('quotes.flow.acceptanceDate')}</Label><Input id="acceptance-date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
   <Label>{t('quotes.flow.acceptedRevision')}</Label><Select value={selected||lifecycle.latestSentSnapshotId||''} onValueChange={setSelected}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{revisions.data?.map(r=><SelectItem key={r.id} value={r.id}>{t('opportunities.documents.revision',{n:String(r.rev_number??0).padStart(2,'0')})} · {r.pdf_filename}</SelectItem>)}</SelectContent></Select>
   <Label htmlFor="acceptance-note">{t('common.notes')}</Label><Textarea id="acceptance-note" value={note} onChange={e=>setNote(e.target.value)}/>
   <Label htmlFor="acceptance-file">{t('quotes.flow.acceptanceAttachment')}</Label><Input id="acceptance-file" type="file" accept=".pdf,.eml,.msg,.png,.jpg,.jpeg" onChange={e=>setAttachment(e.target.files?.[0]??null)}/>
   <DialogFooter><Button variant="ghost" onClick={()=>setOpen(false)}>{t('common.cancel')}</Button><Button disabled={!date||!(selected||lifecycle.latestSentSnapshotId)||mutation.isPending} onClick={()=>mutation.mutate()}>{t('quotes.flow.registerAcceptance')}</Button></DialogFooter>
  </DialogContent></Dialog>
 </>;
}
