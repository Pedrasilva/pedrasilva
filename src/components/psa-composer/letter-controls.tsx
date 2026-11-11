import { useState } from 'react';
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
export function LetterControls({proposal,block,live}:{proposal:PsaProposal;block:PsaProposalBlock;live?:LiveQuoteSnapshot}){
  const {t}=useTranslation('common');const draft=useServerFn(draftProposalLetter);const update=useUpdateBlock(proposal.id);const [busy,setBusy]=useState(false);const [confirm,setConfirm]=useState(false);
  async function run(){setConfirm(false);setBusy(true);try{const r=await draft({data:{proposalId:proposal.id}});await update.mutateAsync({id:block.id,patch:{content_rich:{...block.content_rich,html:r.html,aiFigures:r.figures}}});}catch(e){toast.error(e instanceof Error?e.message:t('error'));}finally{setBusy(false);}}
  return <div className="space-y-2"><Button variant="outline" disabled={busy||!live||!!proposal.locked_at||block.is_locked} onClick={()=>block.content_rich.html||block.content_rich.text?setConfirm(true):void run()}><Sparkles className="mr-2 h-4 w-4"/>{t(busy?'loading':'letter.draftAi')}</Button><details><summary>{t('letter.figures')}</summary><dl className="space-y-1 text-xs">{Object.entries(letterTokenMap(live,proposal)).map(([key,value])=><div key={key}><dt><code>{`{{${key}}}`}</code></dt><dd>{value}</dd></div>)}</dl></details><AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogTitle>{t('letter.replaceTitle')}</AlertDialogTitle><AlertDialogDescription>{t('letter.replaceHint')}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction onClick={()=>void run()}>{t('confirm')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}