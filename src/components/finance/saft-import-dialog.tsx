import uiI18n from "@/i18n/index";
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Upload, Loader2 } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { parseSaft } from '@/lib/finance/provisional-invoicing';
import { useIssuedImportPreview, useIssuedRegistration } from '@/lib/finance/use-provisional-invoicing';

const money = (v:number) => new Intl.NumberFormat(uiI18n.language,{style:'currency',currency:'EUR'}).format(v);
const taxKey = (v:string|null) => (v??'').replace(/[^A-Z0-9]/gi,'').toUpperCase();

export function SaftImportDialog() {
  const { t } = useTranslation(['finance','common','glossary']);
  const [open,setOpen] = useState(false);
  const [file,setFile] = useState<File|null>(null);
  const [parsed,setParsed] = useState<ReturnType<typeof parseSaft>|null>(null);
  const [selected,setSelected] = useState<Record<string,boolean>>({});
  const [assignments,setAssignments] = useState<Record<string,string>>({});
  const [complete,setComplete] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = useIssuedImportPreview(open);
  const register = useIssuedRegistration();
  const rows = useMemo(()=> (parsed?.documents ?? []).map(d=>{
    const clients = (preview.data?.clients ?? []).filter(c=>taxKey(c.nif || c.foreign_tax_id)===taxKey(d.clientTaxId));
    const client = clients.length===1 ? clients[0] : undefined;
    const docs = preview.data?.documents ?? [];
    const exact = docs.find(e=>e.status!=='cancelled' && e.fiscal_type===d.fiscalType && e.fiscal_series===d.series && e.fiscal_number===d.sequence);
    const candidates = docs.filter(e=>e.status!=='cancelled' && client && e.counterparty_client_id===client.id && e.issue_date===d.date && Math.abs(Number(e.total_inc_vat)-d.gross)<=.01 && (!e.fiscal_type || !e.fiscal_series || !e.fiscal_number || e.fiscal_review_reasons.length));
    const divergent = exact && (Math.abs(Number(exact.subtotal_ex_vat)-d.net)>.01 || Math.abs(Number(exact.vat_amount)-d.vat)>.01 || Math.abs(Number(exact.total_inc_vat)-d.gross)>.01 || exact.counterparty_client_id!==client?.id || exact.issue_date!==d.date || d.cancelled);
    const originals = d.originalNumber ? docs.filter(e=>e.document_number===d.originalNumber && e.doc_type==='client_invoice' && e.counterparty_client_id===client?.id && e.status!=='cancelled') : [];
    const original = originals.length===1 ? originals[0] : undefined;
    const projects = (preview.data?.projects ?? []).filter(p=>p.company_id===client?.id);
    const project = assignments[d.number] ?? (projects.length===1 ? projects[0]?.id : '') ?? '';
    const state = exact ? divergent ? 'divergent' : 'existing' : candidates.length ? 'completion' : !client ? 'missingClient' : d.fiscalType==='NC' && !original ? 'missingOriginal' : 'newDocument';
    const canComplete = !!complete[d.number] && candidates.some(c=>c.id===complete[d.number] && Math.abs(Number(c.subtotal_ex_vat)-d.net)<=.01 && Math.abs(Number(c.vat_amount)-d.vat)<=.01 && (c.doc_type=== (d.fiscalType==='NC'?'client_credit_note':'client_invoice')));
    const allowed = !!client && (!exact) && (state==='newDocument' && !!project || state==='completion' && canComplete);
    return { d,client,exact,candidates,original,project,state,allowed };
  }),[parsed,preview.data,assignments,complete]);
  const issuerMatches = !!parsed && !!preview.data && taxKey(parsed.issuerTaxId)===taxKey(preview.data.issuerTaxId) && !!taxKey(parsed.issuerTaxId);

  async function load(f:File|undefined) {
    if (!f) return;
    try {
      if (f.size>20*1024*1024) throw new Error('fileTooLarge');
      const result = parseSaft(await f.text());
      setFile(f);setParsed(result);setSelected({});setAssignments({});setComplete({});
    } catch(e) { toast.error(t(`finance:provisional.errors.${e instanceof Error ? e.message : 'invalidXml'}`)); }
  }
  async function apply() {
    const chosen = rows.filter(r=>selected[r.d.number] && r.allowed);
    if (!file || !issuerMatches || !chosen.length || !preview.data) return;
    if (!window.confirm(t('finance:provisional.confirmImport',{count:chosen.length}))) return;
    setBusy(true);
    try {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
      const path = `saft/${preview.data.entityId}/${crypto.randomUUID()}.xml`;
      const upload = await supabase.storage.from('financial-documents').upload(path,file,{contentType:'application/xml'});
      if (upload.error) throw upload.error;
      for (const r of chosen) {
        if (!r.client) continue;
        await register.mutateAsync({existingId:complete[r.d.number] || undefined,
          header: {
            doc_type:r.d.fiscalType==='NC'?'client_credit_note':'client_invoice',registration_origin:'saft',
            document_number:r.d.number,fiscal_type:r.d.fiscalType,fiscal_series:r.d.series,fiscal_number:r.d.sequence,
            issuer_tax_id:parsed?.issuerTaxId,issue_date:r.d.date,counterparty_client_id:r.client.id,counterparty_name_snapshot:r.client.nome,
            project_id:r.project,status:r.d.cancelled?'cancelled':'issued',original_document_id:r.original?.id ?? null,
            subtotal_ex_vat:r.d.net,vat_amount:r.d.vat,total_inc_vat:r.d.gross,confirm_completion:!!complete[r.d.number],
            import_metadata:{sourcePath:path,fileName:file.name,sha256:hash,importedAt:new Date().toISOString(),fiscalNumber:r.d.number},
          },
          lines:r.d.lines.map((l,i)=>({description:l.description,quantity:1,unit_price_ex_vat:l.net,vat_rate:l.net ? l.vat/l.net*100 : 0,sort_order:i,project_id:r.project})),
        });
        setSelected(s=>({...s,[r.d.number]:false}));
      }
      toast.success(t('finance:provisional.imported',{count:chosen.length}));
      await preview.refetch();
    } catch { toast.error(t('finance:provisional.importStopped')); await preview.refetch(); }
    finally {setBusy(false);}
  }
  return <>
    <Button variant="outline" size="sm" onClick={()=>setOpen(true)}><Upload className="size-4 mr-1"/>{t('finance:provisional.importSaft')}</Button>
    <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{t('finance:provisional.importSaft')}</DialogTitle></DialogHeader>
      <input ref={input} type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={e=>void load(e.target.files?.[0])}/>
      <Button variant="outline" onClick={()=>input.current?.click()} disabled={busy}>{t('finance:provisional.chooseXml')}</Button>
      {file && <p className="text-sm">{file.name}</p>}
      {preview.isLoading && <Loader2 className="size-4 animate-spin"/>}
      {preview.error && <p className="text-destructive">{t('finance:provisional.previewFailed')}</p>}
      {parsed && !issuerMatches && !preview.isLoading && <p className="text-destructive">{t('finance:provisional.issuerMismatch')}</p>}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th/><th>{t('finance:invoices.col.number')}</th><th>{t('finance:invoices.col.client')}</th><th>{t('finance:invoices.col.issueDate')}</th><th>{t('finance:invoices.col.total')}</th><th>{t('common:status')}</th><th>{t('glossary:entity.project')}</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.d.number} className="border-b align-top">
        <td className="py-3 pr-2"><Checkbox aria-label={r.d.number} checked={!!selected[r.d.number]} disabled={busy || !issuerMatches || !r.allowed} onCheckedChange={v=>setSelected(s=>({...s,[r.d.number]:v===true}))}/></td>
        <td className="p-2 font-mono">{r.d.number}</td><td className="p-2">{r.d.clientName}</td><td className="p-2 whitespace-nowrap">{r.d.date}</td><td className="p-2 whitespace-nowrap">{money(r.d.gross)}{r.exact && r.state==='divergent' && <div className="text-destructive">{t('finance:provisional.currentTotal',{value:money(Number(r.exact.total_inc_vat))})}</div>}</td>
        <td className="p-2"><Badge variant="outline">{t(`finance:provisional.${r.state}`)}</Badge>{r.exact && <Link className="block text-primary underline mt-1" to="/finance/documents/$documentId" params={{documentId:r.exact.id}}>{r.exact.document_number}</Link>}
          {r.candidates.length>0 && <Select value={complete[r.d.number]||'none'} onValueChange={v=>{setComplete(s=>({...s,[r.d.number]:v==='none'?'':v}));setSelected(s=>({...s,[r.d.number]:false}));}} disabled={busy}><SelectTrigger className="mt-2 min-w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{t('finance:provisional.chooseCompletion')}</SelectItem>{r.candidates.map(c=><SelectItem key={c.id} value={c.id}>{c.document_number||'—'} · {money(Number(c.total_inc_vat))}</SelectItem>)}</SelectContent></Select>}
        </td><td className="p-2"><Select value={r.project||'none'} onValueChange={v=>setAssignments(s=>({...s,[r.d.number]:v==='none'?'':v}))} disabled={busy || !!r.exact || r.state==='completion'}><SelectTrigger className="min-w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{(preview.data?.projects??[]).map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></td>
      </tr>)}</tbody></table></div>
      <Button onClick={()=>void apply()} disabled={busy || !issuerMatches || !rows.some(r=>r.allowed && selected[r.d.number])}>{busy && <Loader2 className="size-4 mr-1 animate-spin"/>}{t('finance:provisional.confirmSelected')}</Button>
    </DialogContent></Dialog>
  </>;
}