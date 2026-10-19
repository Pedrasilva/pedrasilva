import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { currentEntityId } from './current-entity';
import { numberStages } from '@/lib/quotes/stage-numbering';

export function useIssuedRegistration(edit = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ header, lines, existingId }: { header: Record<string, unknown>; lines: Record<string, unknown>[]; existingId?: string }) => {
      const result = edit && existingId ? await supabase.rpc('fin_edit_issued_document',{_id:existingId,_header:header as Json,_lines:lines as Json}) : await supabase.rpc('fin_register_issued_document', {
        _header: header as Json, _lines: lines as Json, _existing_id: existingId ?? undefined,
      });
      const { data,error } = result;
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fin-docs'] });
      void qc.invalidateQueries({ queryKey: ['project-billing'] });
      void qc.invalidateQueries({ queryKey: ['issued-import-preview'] });
    },
  });
}

export function useStageBilled(projectId:string, enabled:boolean) {
  return useQuery({queryKey:['project-billing','stage-billed',projectId],enabled,queryFn:async()=>{
    const e = await currentEntityId();
    const [docs,lines,milestones] = await Promise.all([
      supabase.from('financial_documents').select('id,doc_type,status,direction').eq('entity_id',e).eq('direction','issued'),
      supabase.from('financial_document_lines').select('document_id,payment_schedule_item_id,amount_ex_vat').eq('project_id',projectId),
      supabase.from('pm_payment_schedule_items').select('id,stage_id').eq('project_id',projectId),
    ]);
    for(const r of [docs,lines,milestones]) if(r.error) throw r.error;
    const map = new Map<string,number>();
    for(const l of lines.data??[]) {
      const d=docs.data?.find(d=>d.id===l.document_id);
      const stage=milestones.data?.find(m=>m.id===l.payment_schedule_item_id)?.stage_id;
      if(!d || !stage || !['client_invoice','client_credit_note'].includes(d.doc_type) || ['draft','cancelled'].includes(d.status))continue;
      map.set(stage,(map.get(stage)??0)+(d.doc_type==='client_credit_note'?-1:1)*Number(l.amount_ex_vat));
    }
    return map;
  }});
}

export function useInvoiceMilestones(projectId: string | null) {
  return useQuery({ queryKey: ['invoice-milestones', projectId], enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return [];
      const [milestones, stages] = await Promise.all([
        supabase.from('pm_payment_schedule_items').select('id,label,stage_id,amount_value,expected_invoice_date').eq('project_id',projectId).eq('direction','inflow').order('sort_order'),
        supabase.from('pm_stages').select('id,name,parent_stage_id,sort_order').eq('project_id',projectId),
      ]);
      if (milestones.error) throw milestones.error;
      if (stages.error) throw stages.error;
      const ordered = numberStages(stages.data ?? []);
      return (milestones.data ?? []).map(m => ({ ...m, stageLabel: ordered.find(s=>s.stage.id===m.stage_id) })).map(m=>({ ...m,
        stageLabel: m.stageLabel ? `${m.stageLabel.number} ${m.stageLabel.stage.name}` : null,
      }));
    },
  });
}

export function useIssuedImportPreview(enabled: boolean) {
  return useQuery({ queryKey: ['issued-import-preview'], enabled,
    queryFn: async () => {
      const entityId = await currentEntityId();
      const [entity, clients, projects] = await Promise.all([
        supabase.from('pm_invoice_settings').select('company_nif').eq('entity_id',entityId).is('project_id',null).maybeSingle(),
        supabase.from('companies').select('id,nome,nif,foreign_tax_id').eq('is_client',true),
        supabase.from('pm_projects').select('id,name,company_id'),
      ]);
      for (const r of [entity,clients,projects]) if (r.error) throw r.error;
      // Page explicitly: reconciliation must never overlook records beyond the API row limit.
      const documents = [];
      for (let offset=0;;offset+=500) {
        const page = await supabase.from('financial_documents').select('*').eq('entity_id',entityId).eq('direction','issued').order('id').range(offset,offset+499);
        if (page.error) throw page.error;
        documents.push(...(page.data ?? []));
        if ((page.data?.length ?? 0)<500) break;
      }
      return { entityId, issuerTaxId: entity.data?.company_nif ?? '', clients: clients.data ?? [], projects: projects.data ?? [], documents };
    },
  });
}