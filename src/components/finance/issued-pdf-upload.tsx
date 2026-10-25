import { useRef,useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Upload,Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { extractIssuedPdf } from '@/lib/finance/issued-pdf.functions';
import { InvoiceEditorDialog,type IssuedPdfDraft } from './invoice-editor-dialog';

export function IssuedPdfUpload({projectId}:{projectId:string}) {
  const {t}=useTranslation('finance');
  const input=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false);
  const [draft,setDraft]=useState<IssuedPdfDraft|null>(null);
  const extract=useServerFn(extractIssuedPdf);
  async function upload(file:File|undefined){
    if(!file)return;
    if(file.type!=='application/pdf'){toast.error(t('provisional.pdfRequired'));return;}
    setBusy(true);
    try{
      const path=`intake/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const up=await supabase.storage.from('financial-documents').upload(path,file,{contentType:'application/pdf'});
      if(up.error)throw up.error;
      const r=await extract({data:{storagePath:path,fileName:file.name,projectId}});
      if(!r.ok){toast.error(t(`provisional.${r.error}`));return;}
      const q=r.queue;
      const raw=q.raw_extraction as {line_items?:Array<{description?:string;quantity?:number;unit_price_ex_vat?:number;amount_ex_vat?:number;vat_rate?:number}>}|null;
      const items=raw?.line_items??[];
      const net=Number(q.extracted_amount??0)-Number(q.extracted_vat_amount??0);
      setDraft({queueId:q.id,filePath:path,docType:q.intake_type==='nota_credito'?'client_credit_note':'client_invoice',clientId:q.matched_client_id,number:q.extracted_document_number??'',date:q.extracted_date??'',dueDate:q.extracted_due_date??'',lines:items.length?items.map(l=>({description:l.description??q.extracted_document_number??'',quantity:Number(l.quantity??1)||1,unit_price_ex_vat:Number(l.unit_price_ex_vat??(Number(l.amount_ex_vat??0)/(Number(l.quantity??1)||1))),vat_rate:Number(l.vat_rate??0),project_id:projectId})): [{description:q.extracted_document_number??'',quantity:1,unit_price_ex_vat:net,vat_rate:net?Number(q.extracted_vat_amount??0)/net*100:0,project_id:projectId}]});
    }catch{toast.error(t('provisional.extractionFailed'));}
    finally{setBusy(false);if(input.current)input.current.value='';}
  }
  return <><input ref={input} type="file" accept="application/pdf" className="hidden" onChange={e=>void upload(e.target.files?.[0])}/><Button size="sm" variant="outline" onClick={()=>input.current?.click()} disabled={busy}>{busy?<Loader2 className="size-4 mr-1 animate-spin"/>:<Upload className="size-4 mr-1"/>}{t('provisional.registerPdf')}</Button><InvoiceEditorDialog open={!!draft} documentId={null} initialProjectId={projectId} initialPdfDraft={draft??undefined} onClose={()=>setDraft(null)}/></>;
}