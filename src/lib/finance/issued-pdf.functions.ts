import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { currentEntityId } from './current-entity';

export const extractIssuedPdf = createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({storagePath:z.string().startsWith('intake/').max(1024),fileName:z.string().max(512),projectId:z.string().uuid()}).parse(input))
  .handler(async({data,context})=>{
    const {supabase,userId}=context;
    const [admin,legacy,edit]=await Promise.all([
      supabase.rpc('has_role',{_user_id:userId,_role:'admin'}),
      supabase.rpc('has_permission',{_user_id:userId,_key:'finance.dashboard'}),
      supabase.rpc('has_module_permission',{_user_id:userId,_key:'finance.documents.edit',_required_scope:'all'}),
    ]);
    if(!admin.data && !legacy.data && !edit.data)throw new Error('Finance edit access required');
    const entityId=await currentEntityId(supabase);
    const project=await supabase.from('pm_projects').select('id').eq('id',data.projectId).single();
    if(project.error)throw new Error('Project access required');
    const {ingestStoredDocument}=await import('./doc-intake.server');
    const result=await ingestStoredDocument({bucket:'financial-documents',storagePath:data.storagePath,originalFilename:data.fileName,source:'manual_upload',createdBy:userId,entityId});
    if(!result.ok || !result.queueItemId)return {ok:false as const,error:'extractionFailed'};
    const q=await supabase.from('financial_document_review_queue').select('id,direction,doc_type,intake_type,status,entity_id,extracted_document_number,extracted_date,extracted_due_date,extracted_amount,extracted_vat_amount,extracted_buyer_name,extracted_buyer_vat,matched_client_id,raw_extraction,source_file_url').eq('id',result.queueItemId).eq('entity_id',entityId).single();
    if(q.error || !q.data)return {ok:false as const,error:'extractionFailed'};
    if(q.data.direction!=='issued' || !['fatura','nota_credito'].includes(q.data.intake_type??'') || q.data.status!=='pending_review')return {ok:false as const,error:q.data.direction==='received'?'purchaseRefused':'notIssuedInvoice'};
    return {ok:true as const,queue:q.data};
  });