import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
D=Path('/tmp/browser/quote-company');D.mkdir(parents=True,exist_ok=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={"width":1280,"height":1800})
  page=await context.new_page()
  storage_key=os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY']; session_json=os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']
  cookies=json.loads(os.environ.get('LOVABLE_BROWSER_SUPABASE_COOKIES_JSON') or '[]')
  if cookies: await context.add_cookies([{**c,'url':'http://localhost:8080'} for c in cookies])
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[storage_key,session_json])
  await page.reload(); await page.wait_for_timeout(1200)
  result=await page.evaluate('''async()=>{
 const {supabase:sb}=await import('/src/integrations/supabase/client.ts');
 const check=({data,error})=>{if(error)throw Error(error.message);return data};
 const prior=check(await sb.from('fee_proposals').select('id,opportunity_id').eq('titulo','[QA DISPOSABLE] Mint company conversion'));for(const x of prior){check(await sb.from('fee_proposals').delete().eq('id',x.id));check(await sb.from('crm_opportunities').delete().eq('id',x.opportunity_id));}
 const source='37ebfc12-6717-474f-a5f4-5887706f7250';
 const before={};for(const t of ['fee_proposals','psa_proposals','psa_proposal_blocks','quote_stages','quote_payment_schedule_items'])before[t]=check(await sb.from(t).select('*').order('id'));
 const real=check(await sb.from('fee_proposals').select('*').eq('id',source).single());
 const mintMatch=check(await sb.rpc('crm_quote_snapshot_matches',{_quote:source,_snapshot:real.accepted_snapshot_id}));
 if(!mintMatch)throw Error('Real accepted snapshot does not match after normalization');
 const opp=check(await sb.from('crm_opportunities').select('*').eq('id',real.opportunity_id).single());
 const oid=crypto.randomUUID(),qid=crypto.randomUUID(),pid=crypto.randomUUID();
 const fixture={quote:qid,opportunity:oid,proposal:pid,company:opp.company_id};
 window.qaFixture=fixture;
 check(await sb.from('crm_opportunities').insert({...opp,id:oid,name:'[QA DISPOSABLE] Mint company conversion',stage:'proposal',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
 const q={...real,id:qid,titulo:'[QA DISPOSABLE] Mint company conversion',company_id:null,opportunity_id:oid,proposal_number:null,parent_quote_id:null,quote_status:'draft',is_locked:false,locked_at:null,locked_project_id:null,pm_project_id:null,accepted_snapshot_id:null,accepted_content_hash:null,acceptance_date:null,acceptance_actor:null,approved_at:null,signed_at:null,signed_method:null,signed_notes:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 check(await sb.from('fee_proposals').insert(q));
 const tables=['quote_stages','quote_stage_dependencies','quote_allocations','quote_external_services','quote_payment_schedule_items','quote_billable_hourly_rates','quote_site_trips','quote_supplier_markups','quote_stage_supplier_costs'];
 const map={};const data={}; for(const t of tables){data[t]=check(await sb.from(t).select('*').eq('quote_id',source));for(const r of data[t])if(r.id)map[r.id]=crypto.randomUUID();}
 // Map embedded stage identities in build settings as well as row foreign keys.
 const remap=v=> typeof v==='string'?(map[v]??v):Array.isArray(v)?v.map(remap):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x)])):v;
 check(await sb.from('fee_proposals').update({quote_build_settings:remap(real.quote_build_settings)}).eq('id',qid));
 for(const t of tables){let rows=data[t].map(r=>({...remap(r),quote_id:qid,...('created_at' in r?{created_at:new Date().toISOString()}:{}),...('updated_at' in r?{updated_at:new Date().toISOString()}: {})}));if(t==='quote_stages'){const parents=rows.map(r=>({id:r.id,parent_stage_id:r.parent_stage_id}));rows=rows.map(r=>({...r,parent_stage_id:null}));if(rows.length)check(await sb.from(t).insert(rows));for(const r of parents)if(r.parent_stage_id)check(await sb.from(t).update({parent_stage_id:r.parent_stage_id}).eq('id',r.id));}else if(rows.length)check(await sb.from(t).insert(rows));}
 const original=check(await sb.from('psa_proposals').select('*').eq('quote_id',source).limit(1).single());
 check(await sb.from('psa_proposals').insert({...original,id:pid,quote_id:qid,status:'draft',locked_at:null,sent_at:null,restored_from_snapshot_id:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
 const blocks=check(await sb.from('psa_proposal_blocks').select('*').eq('proposal_id',original.id));
 if(blocks.length)check(await sb.from('psa_proposal_blocks').insert(blocks.map(b=>({...b,id:crypto.randomUUID(),proposal_id:pid,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}))));
 return {fixture,before,mintMatch};}''')
  (D/'setup.json').write_text(json.dumps(result,indent=2));print('Fixture prepared',result['fixture'],'real accepted snapshot matches',result['mintMatch'])
  await browser.close()
asyncio.run(main())
