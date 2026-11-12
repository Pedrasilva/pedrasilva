"""Fail-closed fixture isolation for persisted composer tests (D46/D47)."""
from pathlib import Path
import json

CREATE = r'''async(sourceId)=>{
 const {supabase:s}=await import('/src/integrations/supabase/client.ts');
 const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};
 if(ck(await s.rpc('pm_project_b1_active')))throw Error('B1 must be OFF');
 const orig=ck(await s.from('psa_proposals').select('*').eq('id',sourceId).single());
 if(!orig.quote_id)throw Error('Source requires a quote');
 const quote=ck(await s.from('fee_proposals').select('*').eq('id',orig.quote_id).single());
 const {id,created_at,updated_at,proposal_number,parent_quote_id,main_proposal_id,work_version_id,work_revision_ordinal,pm_project_id,locked_project_id,accepted_snapshot_id,accepted_content_hash,acceptance_actor,acceptance_date,acceptance_note,acceptance_attachment_path,approved_at,approved_by_contact_id,approved_by_collaborator_id,signed_at,signed_method,signed_notes,signed_by_collaborator_id,archived_at,archived_by,deleted_at,deleted_by,...copy}=quote;
 const testId=crypto.randomUUID();
 const q=ck(await s.from('fee_proposals').insert({...copy,id:testId,titulo:'[QA DISPOSABLE] isolated composer',quote_status:'draft',is_locked:false,locked_at:null,revision_number:1,company_id:null,contact_id:null,account_id:null,opportunity_id:null}).select('id').single());
 if(q.id===orig.quote_id || q.id!==testId)throw Error('Unsafe quote copy');
 const names=['quote_stages','quote_stage_dependencies','quote_allocations','quote_external_services','quote_stage_supplier_costs','quote_supplier_markups','quote_supplier_phase_splits','quote_site_trips','quote_billable_hourly_rates','quote_payment_schedule_items'];
 const tables={},ids={[orig.quote_id]:q.id};
 for(const table of names){tables[table]=ck(await s.from(table).select('*').eq('quote_id',orig.quote_id));for(const row of tables[table])ids[row.id]=crypto.randomUUID();}
 const rewrite=v=>typeof v==='string'?(ids[v]??v):Array.isArray(v)?v.map(rewrite):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,w])=>[k,rewrite(w)])):v;
 for(const table of names){
  const rows=tables[table].map(({created_at,updated_at,...r})=>rewrite(r));
  if(!rows.length)continue;
  const links=table==='quote_stages'?['parent_stage_id','linked_stage_id']:table==='quote_payment_schedule_items'?['linked_payment_item_id']:[];
  ck(await s.from(table).insert(rows.map(r=>({...r,...Object.fromEntries(links.map(k=>[k,null]))}))));
  for(const row of rows)if(links.some(k=>row[k]))ck(await s.from(table).update(Object.fromEntries(links.map(k=>[k,row[k]]))).eq('id',row.id).eq('quote_id',q.id));
 }
 const {id:pid,created_at:pc,updated_at:pu,locked_at:pl,sent_at:ps,...document}=orig;
 const np=ck(await s.from('psa_proposals').insert({...document,quote_id:q.id,title:'[QA DISPOSABLE] isolated composer',status:'draft',client_snapshot:{},project_snapshot:{},outcome:null,restored_from_snapshot_id:null}).select('*').single());
 if(np.quote_id!==q.id || np.quote_id===orig.quote_id)throw Error('Unsafe document link');
 const blocks=ck(await s.from('psa_proposal_blocks').select('*').eq('proposal_id',orig.id).order('sort_order'));
 ck(await s.from('psa_proposal_blocks').insert(blocks.map(({id,created_at,updated_at,...r})=>({...rewrite(r),proposal_id:np.id,is_locked:false}))));
 return {id:np.id,quoteId:q.id,sourceQuoteId:orig.quote_id,original:orig,blocks};
}'''
GUARD = r'''async(f)=>{
 const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};
 if(!f.quoteId || f.quoteId===f.sourceQuoteId)throw Error('Unsafe fixture quote');
 const p=ck(await s.from('psa_proposals').select('id,quote_id').eq('id',f.id).single());
 if(p.quote_id!==f.quoteId)throw Error('Test document points to a real quote');
 const docs=ck(await s.from('psa_proposals').select('id,quote_id').eq('quote_id',f.quoteId));
 const snapshots=ck(await s.from('psa_proposal_snapshots').select('snapshot').in('proposal_id',docs.map(p=>p.id)));
 for(const row of snapshots){const linked=row.snapshot?.proposal?.quote_id;const raw=row.snapshot?.quote_data?.raw?.quote?.id;if((linked&&linked!==f.quoteId)||(raw&&raw!==f.quoteId))throw Error('Test revision points to a real quote');}
 return true;
}'''
async def create_fixture(page, source_id):
    f = await page.evaluate(CREATE, source_id)
    await assert_fixture(page, f)
    return f
async def assert_fixture(page, f):
    await page.evaluate(GUARD, f)
async def finish_fixture(page, f):
    # No automatic deletion: retain fixtures for explicit reviewed cleanup.
    await assert_fixture(page, f)
    result = await page.evaluate(r'''async(f)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const r=await s.from('psa_proposal_blocks').select('*').eq('proposal_id',f.original.id).order('sort_order');if(r.error)throw Error(r.error.message);return {unchanged:JSON.stringify(r.data)===JSON.stringify(f.blocks),quoteId:f.quoteId,proposalId:f.id}}''', f)
    if not result['unchanged']: raise AssertionError('Original content changed')
    print('PRESERVED FIXTURE', json.dumps(result))
