import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Pencil,Save,X,RotateCcw,CheckCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Table,TableHeader,TableHead,TableRow,TableBody,TableCell} from '@/components/ui/table';
import {toast} from '@/lib/toast';
import {displayPaymentDate,type IncomingTimingRow} from '@/lib/projects/payment-timing';
import {useProjectIncomingTiming,useChangePaymentDates} from '@/lib/projects/use-project-payment-schedule';
import {useInvoiceAction} from '@/lib/finance/use-invoices-to-issue';
import {invoiceStatus} from '@/lib/finance/invoices-to-issue';
import {buildStageNumberMap,formatStageLabel} from '@/lib/quotes/stage-numbering';
export function ProjectIncomingPayments({projectId}:{projectId:string}) {
  const {t,i18n}=useTranslation(); const query=useProjectIncomingTiming(projectId); const change=useChangePaymentDates(projectId);
  const [editing,setEditing]=useState<IncomingTimingRow|null>(null);
  const [invoice,setInvoice]=useState('');const [payment,setPayment]=useState('');const [reason,setReason]=useState('');
  const [trigger,setTrigger]=useState('');const [stage,setStage]=useState('');
  const confirm=useInvoiceAction(projectId);const [ready,setReady]=useState<IncomingTimingRow|null>(null);const [readyNote,setReadyNote]=useState('');
  const date=(value:string|null)=>displayPaymentDate(value,i18n.language)??t('projects:incomingTiming.undefined');
  const money=(value:number)=>new Intl.NumberFormat(i18n.language,{style:'currency',currency:'EUR'}).format(value);
  const stageNumbers=buildStageNumberMap(query.data?.stages??[]);
  async function save(clear=false){
    if(!editing)return;
    try{await change.mutateAsync({id:editing.id,reason,patch:clear?{planned_invoice_date_override:null,planned_payment_date_override:null}:{planned_invoice_date_override:invoice||null,planned_payment_date_override:payment||null,trigger_type:trigger,stage_id:stage||null}});setEditing(null);toast.success(t('common:saved'));}
    catch(e){toast.error((e as Error).message);}
  }
  if(query.isPending)return <div className="p-4 text-muted-foreground">{t('common:loading')}</div>;
  if(query.error)return <div className="p-4 text-destructive">{query.error.message}</div>;
  return <div className="space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">{t('projects:incomingTiming.title')}</h2><span className="font-semibold tabular-nums">{money((query.data?.rows??[]).reduce((sum,row)=>sum+Number(row.amount_value),0))}</span></div>
    <div className="overflow-x-auto"><Table><TableHeader><TableRow>
      <TableHead>{t('common:description')}</TableHead><TableHead>{t('glossary:entity.stage')}</TableHead><TableHead>{t('glossary:financial.value')}</TableHead>
      <TableHead>{t('projects:incomingTiming.invoiceDate')}</TableHead><TableHead>{t('projects:incomingTiming.paymentDate')}</TableHead><TableHead>{t('projects:incomingTiming.contractDate')}</TableHead><TableHead>{t('projects:incomingTiming.slippage')}</TableHead><TableHead>{t('common:status')}</TableHead><TableHead />
    </TableRow></TableHeader><TableBody>{query.data?.rows.map(row=><TableRow key={row.id}>
      <TableCell className="min-w-52"><div>{row.label}</div>{row.problems.map(problem=><div key={problem} className="text-xs text-muted-foreground">{t(`projects:incomingTiming.problems.${problem}`)}</div>)}</TableCell>
      <TableCell className="min-w-40">{row.stage_name?formatStageLabel({id:row.stage_id??'',name:row.stage_name},stageNumbers.get(row.stage_id??'')):t(`projects:incomingTiming.triggers.${row.trigger_type}`)}{row.resolved_month_index!==null&&<div className="text-xs text-muted-foreground">{t('projects:incomingTiming.constructionMonth',{number:row.resolved_month_index+1})}</div>}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{money(Number(row.amount_value))}</TableCell><TableCell className="whitespace-nowrap">{date(row.planned_invoice_date)}{row.planned_invoice_date_override&&<Badge variant="outline">{t('projects:incomingTiming.override')}</Badge>}</TableCell>
      <TableCell className="whitespace-nowrap">{date(row.planned_payment_date)}</TableCell><TableCell className="whitespace-nowrap">{date(row.contract_invoice_date)}</TableCell>
      <TableCell>{row.slippage_working_days===null?'—':t('projects:incomingTiming.workingDays',{count:row.slippage_working_days})}</TableCell>
      <TableCell><Badge variant="outline">{t(`finance:issueQueue.status.${invoiceStatus({...row,workflow:row.workflow??{confirmed_at:null,confirmed_by:null,note:null,confirmation_current:false,invoice_number:null,issue_date:null}},query.data?.today??'0000-01-01')}`)}</Badge>{row.workflow?.confirmed_at&&<div className="text-xs text-muted-foreground">{t(`finance:issueQueue.confirmationStates.${row.workflow.confirmation_current?'confirmed':'stale'}`)}</div>}{row.workflow?.note&&<p className="max-w-48 break-words text-xs text-muted-foreground">{row.workflow.note}</p>}{row.frozen&&<div className="text-xs text-muted-foreground">{t('projects:incomingTiming.frozen')}</div>}{query.data?.can_edit_dates&&!row.frozen&&<Button variant="ghost" size="icon" disabled={!row.planned_invoice_date||confirm.isPending} title={t('finance:issueQueue.ready')} aria-label={t('finance:issueQueue.ready')} onClick={()=>{setReady(row);setReadyNote('');}}><CheckCheck className="size-4"/></Button>}</TableCell>
      <TableCell>{query.data?.can_edit_dates&&!row.frozen&&<Button variant="ghost" size="icon" title={t('projects:incomingTiming.editDates')} aria-label={t('projects:incomingTiming.editDates')} onClick={()=>{setEditing(row);setInvoice(row.planned_invoice_date_override??'');setPayment(row.planned_payment_date_override??'');setTrigger(row.trigger_type);setStage(row.stage_id??'');setReason('');}}><Pencil className="size-4"/></Button>}</TableCell>
    </TableRow>)}</TableBody></Table></div>
    {ready&&<div className="space-y-3 border-t border-border pt-4"><h3 className="font-medium">{t('finance:issueQueue.ready')} · {ready.label}</h3><Input aria-label={t('finance:issueQueue.optionalNote')} placeholder={t('finance:issueQueue.optionalNote')} value={readyNote} maxLength={2000} onChange={e=>setReadyNote(e.target.value)}/><div className="flex gap-2"><Button disabled={confirm.isPending} onClick={async()=>{try{await confirm.mutateAsync({id:ready.id,action:'confirm',note:readyNote});setReady(null);toast.success(t('common:saved'));}catch(e){toast.error((e as Error).message);}}}>{t('common:save')}</Button><Button variant="ghost" size="icon" aria-label={t('common:cancel')} onClick={()=>setReady(null)}><X className="size-4"/></Button></div></div>}
    {editing&&<div className="border-t border-border pt-4 space-y-3">
      <h3 className="font-medium">{editing.label}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">{t('projects:incomingTiming.invoiceOverride')}<Input type="date" value={invoice} onChange={e=>setInvoice(e.target.value)}/></label>
      <label className="text-sm">{t('projects:incomingTiming.paymentOverride')}<Input type="date" value={payment} onChange={e=>setPayment(e.target.value)}/></label>
      <label className="text-sm">{t('projects:incomingTiming.trigger')}<Select value={trigger} onValueChange={setTrigger}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['project_start','stage_start','stage_end','manual_date','monthly'].map(value=><SelectItem key={value} value={value}>{t(`projects:incomingTiming.triggers.${value}`)}</SelectItem>)}</SelectContent></Select></label>
      <label className="text-sm">{t('glossary:entity.stage')}<Select value={stage||'none'} onValueChange={value=>setStage(value==='none'?'':value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{t('projects:incomingTiming.undefined')}</SelectItem>{query.data?.stages.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></label>
      </div><Input aria-label={t('projects:incomingTiming.reason')} placeholder={t('projects:incomingTiming.reason')} value={reason} onChange={e=>setReason(e.target.value)}/>
      <div className="flex gap-2"><Button disabled={!reason.trim()||change.isPending} onClick={()=>save()}><Save className="mr-2 size-4"/>{t('common:save')}</Button><Button variant="outline" disabled={!reason.trim()||change.isPending} onClick={()=>save(true)}><RotateCcw className="mr-2 size-4"/>{t('projects:incomingTiming.clearOverride')}</Button><Button variant="ghost" size="icon" aria-label={t('common:cancel')} onClick={()=>setEditing(null)}><X className="size-4"/></Button></div>
    </div>}
  </div>;
}