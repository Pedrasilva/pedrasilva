import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Check, X, Inbox } from "lucide-react";
import { toast } from "sonner";
import { useApprovalInbox, useInboxDecision } from "@/lib/hr/use-approval-inbox";
import type { ApprovalRow } from "@/lib/hr/approval-inbox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { RestrictedCard } from "@/components/PermissionGate";
import { useDateLocale } from "@/i18n/use-date-locale";
import { cn } from "@/lib/utils";
import { PostApprovalsSection } from "@/components/marketing/post-approvals-section";
import { useMyPostApprovals } from "@/lib/marketing/use-post-approvals";

export const Route = createFileRoute("/_app/hr/aprovacoes")({
  validateSearch:(s:Record<string,unknown>) => ({pedido:typeof s.pedido === "string" && /^[0-9a-f-]{36}$/i.test(s.pedido) ? s.pedido : undefined,tipo:typeof s.tipo === "string" ? s.tipo : "all",colaborador:typeof s.colaborador === "string" ? s.colaborador : "all"}),
  head:() => ({meta:[{title:"Aprovações HR | PSA Hub"},{name:"description",content:"Pedidos de ausências, alterações e teletrabalho pendentes de aprovação."},{property:"og:title",content:"Aprovações HR | PSA Hub"},{property:"og:description",content:"Caixa de entrada de aprovações da equipa."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
  component:ApprovalInboxPage,
});
function ApprovalInboxPage() {
  const {t} = useTranslation(["hr","common","glossary"]);
  const search = Route.useSearch();
  const navigate = useNavigate({from:Route.fullPath});
  const inbox = useApprovalInbox(search.pedido);
  const decide = useInboxDecision();
  const postApprovals = useMyPostApprovals();
  const locale = useDateLocale();
  const [selected,setSelected] = useState<Set<string>>(new Set());
  const [reject,setReject] = useState<ApprovalRow|null>(null);
  const [reason,setReason] = useState("");
  const [errors,setErrors] = useState<Record<string,string>>({});
  const [bulk,setBulk] = useState(false);
  const date = (v:string) => format(parseISO(v),"dd/MM/yyyy",{locale});
  const type = (r:ApprovalRow) => r.kind === "remote" ? t("hr:approvalInbox.remote") : r.kind === "change" ? `${t("hr:approvalInbox.change")} · ${t(`hr:leaveChange.kind.${r.changeKind}`)}` : t(`hr:approvalInbox.types.${r.type}`);
  const visible = inbox.rows.filter(r => r.id === search.pedido || ((search.tipo === "all" || (r.kind === "leave" ? r.type : r.kind) === search.tipo) && (search.colaborador === "all" || r.collaboratorId === search.colaborador)));
  const eligible = visible.filter(r => r.canApprove);
  const busy = bulk || decide.isPending;
  useEffect(() => {if(search.pedido && inbox.data) document.getElementById(`request-${search.pedido}`)?.scrollIntoView({block:"center"});},[search.pedido,inbox.data]);
  function errorText(e:unknown) {
    const message = (e as Error)?.message ?? String(e);
    const code = ["own_request","not_approver","not_pending","not_recipient","reason_required","overlap"].find(c => message.includes(c));
    return code ? t(`hr:leaveChange.errors.${code}`) : message.includes("chk_baixa") ? t("hr:leaveChange.sickCertRequired") : message;
  }
  async function act(row:ApprovalRow,approve:boolean) {
    try {await decide.mutateAsync({row,approve,reason});setSelected(s => {const next=new Set(s);next.delete(row.id);return next;});setErrors(e => {const n={...e};delete n[row.id];return n;});setReject(null);setReason("");return true;}
    catch(e){setErrors(v=>({...v,[row.id]:errorText(e)}));toast.error(errorText(e));return false;}
  }
  async function approveSelected() {setBulk(true);try {for(const row of eligible.filter(r => selected.has(r.id))) await act(row,true);}finally {setBulk(false);}}
  async function proof(path:string) {const {data,error}=await supabase.storage.from("leave-attachments").createSignedUrl(path,300);if(error || !data){toast.error(error?.message ?? t("common:errorTitle"));return;}window.open(data.signedUrl,"_blank","noopener");}
  if(inbox.isPending) return <p className="text-sm text-muted-foreground">{t("common:loading")}</p>;
  if(inbox.error) return <div role="alert" className="text-destructive">{errorText(inbox.error)}</div>;
  if(!inbox.allowed) return postApprovals.rows.length ? <div className="space-y-5"><h1 className="text-2xl font-semibold">{t("common:shell.link.hr.approvals")}</h1><PostApprovalsSection/></div> : <RestrictedCard/>;
  const focused=inbox.data?.focused;
  return <div className="space-y-5">
    <header className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{t("common:shell.link.hr.approvals")}</h1><span className="text-sm text-muted-foreground">{t("hr:approvalInbox.pendingCount",{count:inbox.rows.length})}</span></header>
    <PostApprovalsSection/>
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-56"><Label>{t("hr:approvalInbox.type")}</Label><Select value={search.tipo} onValueChange={tipo=>navigate({search:s=>({...s,tipo})})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{t("common:all")}</SelectItem>{[...new Set(inbox.rows.map(r=>r.kind === "leave" ? r.type : r.kind))].map(k=><SelectItem key={k} value={k}>{k === "remote" ? t("hr:approvalInbox.remote") : k === "change" ? t("hr:approvalInbox.change") : t(`hr:approvalInbox.types.${k}`)}</SelectItem>)}</SelectContent></Select></div>
      <div className="w-64"><Label>{t("glossary:hr.employee")}</Label><Select value={search.colaborador} onValueChange={colaborador=>navigate({search:s=>({...s,colaborador})})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{t("common:all")}</SelectItem>{[...new Map(inbox.rows.map(r=>[r.collaboratorId,r.collaborator])).entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>
      <Button disabled={busy || !eligible.some(r=>selected.has(r.id))} onClick={()=>void approveSelected()}><Check className="h-4 w-4"/>{t("hr:approvalInbox.approveSelected",{count:eligible.filter(r=>selected.has(r.id)).length})}</Button>
    </div>
    {search.pedido && focused && focused.status !== "pendente" && <div role="status" className="border-l-2 border-primary bg-muted p-4 text-sm">{t(["aprovada","aceite"].includes(focused.status) ? "hr:approvalInbox.alreadyApproved" : ["rejeitada","recusada"].includes(focused.status) ? "hr:approvalInbox.alreadyRejected" : "hr:approvalInbox.alreadyDecided",{person:focused.decidedBy ?? "—",date:focused.decidedAt ? date(focused.decidedAt) : "—"})}</div>}
    {search.pedido && !focused && <p role="status" className="text-sm text-muted-foreground">{t("hr:approvalInbox.notAvailable")}</p>}
    {!visible.length ? <div className="py-14 text-center text-muted-foreground"><Inbox className="mx-auto mb-3 h-7 w-7"/><p>{t("hr:approvalInbox.empty")}</p></div> : <div className="overflow-x-auto border-y"><Table className="min-w-[1100px]"><TableHeader><TableRow>
      <TableHead><Checkbox aria-label={t("hr:approvalInbox.selectAll")} checked={eligible.length>0 && eligible.every(r=>selected.has(r.id))} disabled={busy || !eligible.length} onCheckedChange={v=>setSelected(v ? new Set(eligible.map(r=>r.id)) : new Set())}/></TableHead>
      {[t("glossary:hr.employee"),t("hr:approvalInbox.type"),t("hr:leaveChange.start"),t("hr:leaveChange.end"),t("hr:approvalInbox.days"),t("hr:approvalInbox.notes"),t("hr:remoteWork.requestedOn"),t("hr:approvalInbox.waiting"),t("hr:approvalInbox.balance"),t("hr:approvalInbox.decisions")].map(h=><TableHead key={h}>{h}</TableHead>)}
    </TableRow></TableHeader><TableBody>{visible.map(r=><TableRow key={r.id} id={`request-${r.id}`} className={cn(r.id === search.pedido && "bg-accent")}>
      <TableCell><Checkbox aria-label={t("hr:approvalInbox.selectRequest",{person:r.collaborator})} disabled={busy || !r.canApprove} checked={selected.has(r.id)} onCheckedChange={v=>setSelected(s=>{const next=new Set(s);v ? next.add(r.id) : next.delete(r.id);return next;})}/></TableCell>
      <TableCell className="font-medium">{r.collaborator}</TableCell><TableCell>{type(r)}{r.period && ["manha","tarde","morning","afternoon"].includes(r.period) && <div className="text-xs text-muted-foreground">{t(`hr:leaveChange.periodo.${["manha","morning"].includes(r.period) ? "manha" : "tarde"}`)}</div>}</TableCell><TableCell className="whitespace-nowrap">{date(r.start)}</TableCell><TableCell className="whitespace-nowrap">{date(r.end)}</TableCell><TableCell>{r.days}</TableCell>
      <TableCell className="min-w-48 max-w-72"><p className="whitespace-pre-wrap break-words text-xs">{r.notes ?? "—"}</p>{r.attachment && <Button variant="link" size="sm" className="h-auto px-0" onClick={()=>void proof(r.attachment ?? "")}>{t("hr:leaveChange.viewAttachment")}</Button>}</TableCell>
      <TableCell className="whitespace-nowrap">{date(r.submitted)}</TableCell><TableCell>{t("hr:approvalInbox.waitingDays",{count:Math.max(0,differenceInCalendarDays(new Date(),parseISO(r.submitted)))})}</TableCell><TableCell>{r.balance === null ? "—" : r.balance}</TableCell>
      <TableCell className="sticky right-0 bg-background"><div className="flex gap-1"><Button size="sm" variant="outline" disabled={busy || !r.canApprove} onClick={()=>void act(r,true)}><Check className="h-3 w-3"/>{t("hr:leaveChange.approve")}</Button><Button size="sm" variant="outline" disabled={busy || !r.canDecide} onClick={()=>{setReason("");setReject(r);}}><X className="h-3 w-3"/>{t("hr:leaveChange.reject")}</Button></div>{r.blockReason && <p className="mt-1 max-w-56 text-xs text-muted-foreground">{t(r.blockReason === "certificate" ? "hr:leaveChange.sickCertRequired" : `hr:leaveChange.errors.${r.blockReason}`)}</p>}{errors[r.id] && <p role="alert" className="mt-1 text-xs text-destructive">{errors[r.id]}</p>}</TableCell>
    </TableRow>)}</TableBody></Table></div>}
    <Dialog open={!!reject} onOpenChange={v=>{if(!v)setReject(null);}}><DialogContent><DialogHeader><DialogTitle>{t("hr:leaveChange.rejectTitle")}</DialogTitle></DialogHeader><Label htmlFor="reject-reason">{t(reject?.kind === "remote" ? "hr:remoteWork.rejectReason" : "hr:leaveChange.rejectReason")}</Label><Textarea id="reject-reason" value={reason} onChange={e=>setReason(e.target.value)} rows={3}/><DialogFooter><Button disabled={busy || (reject?.kind !== "remote" && !reason.trim())} onClick={()=>{if(reject)void act(reject,false);}}>{t("hr:leaveChange.reject")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}