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
import { needsRevisionSend } from '@/lib/quotes/quote-lifecycle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SendProposalDialog } from '@/components/psa-composer/send-proposal-dialog';
import type { PsaProposal } from '@/lib/psa-proposal/types';
import { useNextRevNumber } from '@/lib/psa-proposal/use-proposal-revisions';
export function QuoteWorkflowActions({quoteId,lifecycle,onConvert,onGoToSignature,isConverting}: {
 quoteId:string; lifecycle:QuoteLifecycle; onConvert:()=>void; onGoToSignature?:()=>void;
 status?:QuoteStatus; hasAccount?:boolean; hasProject?:boolean; companyId?:string|null; defaultContactId?:string|null;
 isConverting?:boolean; isSigned?:boolean; canOverrideSignature?:boolean;
}) {
 const {t}=useTranslation('crm'); const qc=useQueryClient(); const [open,setOpen]=useState(false);
 const [date,setDate]=useState(''); const [note,setNote]=useState(''); const [attachment,setAttachment]=useState<File|null>(null);
 const [selected,setSelected]=useState('');
 const [sendOpen,setSendOpen]=useState(false);
 const proposal=useQuery({queryKey:['quote-workflow-proposal',quoteId],queryFn:async()=>{const {data,error}=await supabase.from('psa_proposals').select('*').eq('quote_id',quoteId).order('updated_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data as unknown as PsaProposal|null;}});
 const nextRev=useNextRevNumber(proposal.data?.id);
 const revisions=useQuery({queryKey:['quote-acceptance-revisions',quoteId],enabled:open,queryFn:async()=>{
  const {data:proposals,error:pError}=await supabase.from('psa_proposals').select('id').eq('quote_id',quoteId);if(pError)throw pError;
  const {data,error}=await supabase.from('psa_proposal_snapshots').select('id,rev_number,pdf_filename').in('proposal_id',(proposals??[]).map(p=>p.id)).eq('kind','sent').order('created_at',{ascending:false});if(error)throw error;return data??[];
 }});
 const snapshotId=selected||lifecycle.latestSentSnapshotId;
 const match=useQuery({queryKey:['quote-acceptance-match',quoteId,snapshotId],enabled:open&&!!snapshotId,staleTime:0,queryFn:async()=>{
  if(!snapshotId)return false;
  const {data,error}=await supabase.rpc('crm_quote_snapshot_matches',{_quote:quoteId,_snapshot:snapshotId});if(error)throw error;return data;
 }});
 const unsent=needsRevisionSend(lifecycle);
 const revisionLabels={current:String(lifecycle.currentRevision??nextRev.nextRev).padStart(2,'0'),sent:String(lifecycle.latestSentRevision??0).padStart(2,'0')};
 const mutation=useMutation({mutationFn:async()=>{
  if(!snapshotId)throw new Error(t('quotes.flow.revision'));
  const {data:matches,error:matchError}=await supabase.rpc('crm_quote_snapshot_matches',{_quote:quoteId,_snapshot:snapshotId});
  if(matchError)throw matchError;
  if(!matches)throw new Error(t('quotes.flow.acceptanceMismatch'));
  let path:string|null=null;
  if(attachment){path=`${quoteId}/acceptance/${crypto.randomUUID()}-${attachment.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error}=await supabase.storage.from('proposal-pdfs').upload(path,attachment);if(error)throw error;}
  const {error}=await supabase.rpc('crm_quote_transition',{_quote:quoteId,_action:'accept',_date:date,_note:note,_snapshot:selected||lifecycle.latestSentSnapshotId||undefined,_attachment:path??undefined});
  if(error){if(path)await supabase.storage.from('proposal-pdfs').remove([path]);throw error;}
 },onSuccess:()=>{setOpen(false);qc.invalidateQueries();toast.success(t('quotes.workflow.toast.approved'));},onError:(e:Error)=>{qc.invalidateQueries({queryKey:['quote-acceptance-match']});toast.error(e.message==='Accepted revision differs from current quote'?t('quotes.flow.acceptanceMismatch'):e.message);}});
 const state=lifecycle.state;
 return <>
  {unsent&&<Alert className="basis-full"><AlertDescription className="flex flex-wrap items-center justify-between gap-2"><span>{t('quotes.flow.unsentRevision',revisionLabels)}</span><Button size="sm" variant="outline" disabled={!proposal.data} onClick={()=>setSendOpen(true)}><Send className="mr-1 h-4 w-4"/>{t('quotes.flow.sendCurrentRevision',revisionLabels)}</Button></AlertDescription></Alert>}
  {state==='draft'&&<Button size="sm" onClick={()=>proposal.data?setSendOpen(true):onGoToSignature?.()}><Send className="mr-1 h-4 w-4"/>{t('quotes.workflow.send')}</Button>}
  {state==='sent'&&<Button size="sm" onClick={()=>setOpen(true)}><CheckCircle2 className="mr-1 h-4 w-4"/>{t('quotes.flow.registerAcceptance')}</Button>}
  {(state==='approved'||state==='signed'||state==='converted')&&<Button size="sm" onClick={onConvert} disabled={isConverting}><ExternalLink className="mr-1 h-4 w-4"/>{t(state==='converted'?'quotes.workflow.openProject':'quotes.workflow.convertCta')}</Button>}
  {state==='approved'&&<Button size="sm" variant="outline" onClick={onGoToSignature}><FileSignature className="mr-1 h-4 w-4"/>{t('quotes.flow.signatureAction')}</Button>}
  {proposal.data && <SendProposalDialog proposal={proposal.data} nextRev={nextRev.nextRev} open={sendOpen} onOpenChange={setSendOpen} />}
  <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{t('quotes.flow.registerAcceptance')}</DialogTitle><DialogDescription>{t('quotes.flow.acceptanceDescription')}</DialogDescription></DialogHeader>
   {(unsent||match.data===false)&&<Alert><AlertDescription><p>{unsent?t('quotes.flow.unsentRevision',revisionLabels):t('quotes.flow.acceptanceMismatch')}</p><p>{t('quotes.flow.acceptanceMismatch')}</p><Button size="sm" variant="outline" disabled={!proposal.data} onClick={()=>{setOpen(false);setSendOpen(true);}}>{t('quotes.flow.sendCurrentRevision',revisionLabels)}</Button></AlertDescription></Alert>}
   <Label htmlFor="acceptance-date">{t('quotes.flow.acceptanceDate')}</Label><Input id="acceptance-date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
   <Label>{t('quotes.flow.acceptedRevision')}</Label><Select value={selected||lifecycle.latestSentSnapshotId||''} onValueChange={setSelected}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{revisions.data?.map(r=><SelectItem key={r.id} value={r.id}>{t('opportunities.documents.revision',{n:String(r.rev_number??0).padStart(2,'0')})} · {r.pdf_filename}</SelectItem>)}</SelectContent></Select>
   <Label htmlFor="acceptance-note">{t('common.notes')}</Label><Textarea id="acceptance-note" value={note} onChange={e=>setNote(e.target.value)}/>
   <Label htmlFor="acceptance-file">{t('quotes.flow.acceptanceAttachment')}</Label><Input id="acceptance-file" type="file" accept=".pdf,.eml,.msg,.png,.jpg,.jpeg" onChange={e=>setAttachment(e.target.files?.[0]??null)}/>
   <DialogFooter><Button variant="ghost" onClick={()=>setOpen(false)}>{t('common.cancel')}</Button><Button disabled={!date||!snapshotId||match.data!==true||match.isFetching||mutation.isPending} onClick={()=>mutation.mutate()}>{t('quotes.flow.registerAcceptance')}</Button></DialogFooter>
  </DialogContent></Dialog>
 </>;
}
