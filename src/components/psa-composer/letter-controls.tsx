import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServerFn } from '@tanstack/react-start';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { draftProposalLetter } from '@/lib/psa-proposal/letter.functions';
import { useUpdateBlock } from '@/lib/psa-proposal/use-psa-proposal';
import { letterTokenMap } from '@/lib/psa-proposal/letter';
import type { PsaProposal,PsaProposalBlock } from '@/lib/psa-proposal/types';
import type { LiveQuoteSnapshot } from '@/lib/psa-proposal/live-data';
import { useLetterSources } from '@/lib/psa-proposal/use-letter-sources';
import { letterFieldDefaults, letterBodyUnchanged, type LetterFields } from '@/lib/psa-proposal/letter-fields';
import { resolveMaster } from '@/lib/psa-proposal/master-page';
import { useLetterSettings } from '@/lib/psa-proposal/use-letter-settings';
import { DEFAULT_LETTER_SETTINGS } from '@/lib/psa-proposal/letter';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
export function LetterControls({proposal,block,live}:{proposal:PsaProposal;block:PsaProposalBlock;live?:LiveQuoteSnapshot}){
  const {t}=useTranslation('common');const draft=useServerFn(draftProposalLetter);const update=useUpdateBlock(proposal.id);const [busy,setBusy]=useState(false);const [confirm,setConfirm]=useState(false);
  const sources=useLetterSources(proposal.quote_id);const practice=useLetterSettings();
  const latest=useRef(block.content_rich);latest.current=block.content_rich;
  const fields=block.content_rich.letterFields as LetterFields|undefined;
  const locked=!!proposal.locked_at||block.is_locked;
  async function adopt(){
    const lang=proposal.language==='en'?'en':'pt-PT';
    const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const master=resolveMaster(proposal.style_settings);
    const defaults=letterFieldDefaults(sources.data??{},live,master,lang,date);
    await update.mutateAsync({id:block.id,patch:{content_rich:{...latest.current,letterVersion:2,letterNeedsSources:false,letterFields:defaults,letterSettings:practice.data?.settings??proposal.style_settings.letterSettings??DEFAULT_LETTER_SETTINGS}}});
  }
  async function run(){setConfirm(false);setBusy(true);const before=latest.current;try{const r=await draft({data:{proposalId:proposal.id}});if(!letterBodyUnchanged(before,latest.current)){toast.error(t('letter.changedDuringGeneration'));return;}await update.mutateAsync({id:block.id,expectedContent:before,patch:{content_rich:{...latest.current,html:r.html,text:undefined,aiFigures:r.figures}}});}catch(e){toast.error(e instanceof Error?e.message:t('error'));}finally{setBusy(false);}}
  const patch=(key:keyof LetterFields,value:string)=>{if(!fields)return;void update.mutateAsync({id:block.id,patch:{content_rich:{...latest.current,letterFields:{...fields,[key]:value}}}}).catch(e=>toast.error(e.message));};
  return <div className="space-y-3">
    {(block.content_rich.letterVersion!==2||block.content_rich.letterNeedsSources===true)&&<Button variant="outline" disabled={locked||update.isPending||sources.isPending||sources.isError||!live} onClick={()=>void adopt().catch(e=>toast.error(e.message))}>{t('letter.adoptLayout')}</Button>}
    {fields&&<fieldset disabled={locked||busy} className="space-y-2">{(['recipientCompany','recipientContact','recipientAddress','recipientPostalCode','recipientCity','sender','place','date','subject','salutation','signatoryRole'] as Array<keyof LetterFields>).map(key=><div key={key} className="space-y-1"><Label htmlFor={`letter-${block.id}-${key}`}>{t(`letter.fields.${key}`)}</Label>{key==='sender'||key==='recipientAddress'?<Textarea id={`letter-${block.id}-${key}`} rows={3} value={fields[key]} onChange={e=>patch(key,e.target.value)}/>:<Input id={`letter-${block.id}-${key}`} type={key==='date'?'date':'text'} value={fields[key]} onChange={e=>patch(key,e.target.value)}/>}</div>)}</fieldset>}
    <Button variant="outline" disabled={busy||!live||locked} onClick={()=>block.content_rich.html||block.content_rich.text?setConfirm(true):void run()}><Sparkles className="mr-2 h-4 w-4"/>{t(busy?'loading':'letter.draftAi')}</Button><details><summary>{t('letter.figures')}</summary><dl className="space-y-1 text-xs">{Object.entries((block.content_rich.aiFigures as Record<string,string>|undefined)??letterTokenMap(live,proposal)).map(([key,value])=><div key={key}><dt><code>{`{{${key}}}`}</code></dt><dd>{value}</dd></div>)}</dl></details><AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogTitle>{t('letter.replaceTitle')}</AlertDialogTitle><AlertDialogDescription>{t('letter.replaceHint')}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction onClick={()=>void run()}>{t('confirm')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}