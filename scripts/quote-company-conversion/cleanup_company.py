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
  fixture=json.loads((D/'checks.json').read_text())['fixture'];converted=json.loads((D/'converted.json').read_text())
  result=await page.evaluate("""async({f,project})=>{const {supabase:sb}=await import('/src/integrations/supabase/client.ts');const ck=({data,error})=>{if(error)throw Error(error.message);return data};
 const inline=ck(await sb.from('fee_proposals').select('id').eq('titulo','[QA DISPOSABLE] Inline company picker'));for(const x of inline)ck(await sb.from('fee_proposals').delete().eq('id',x.id));
 // No real project has these IDs; project has no logged history or expenses.
 for(const t of ['pm_expenses','financial_documents']){const rows=ck(await sb.from(t).select('id').eq('project_id',project));if(rows.length)throw Error('Unexpected fixture actuals');}
 ck(await sb.from('pm_project_contract_baseline').delete().eq('project_id',project));
 ck(await sb.from('pm_payment_schedule_items').delete().eq('project_id',project));
 ck(await sb.from('pm_stages').delete().eq('project_id',project));
 const removal=ck(await sb.rpc('delete_project_hard',{_project_id:project,_confirm:'DELETE PROJECT',_cascade:false}));if(removal.status!=='deleted')throw Error('Project cleanup blocked '+JSON.stringify(removal));
 ck(await sb.from('fee_proposals').update({accepted_snapshot_id:null,pm_project_id:null,locked_project_id:null}).eq('id',f.quote));
 ck(await sb.from('psa_proposal_snapshots').delete().eq('proposal_id',f.proposal));
 ck(await sb.from('psa_proposals').delete().eq('id',f.proposal));
 ck(await sb.from('fee_proposals').delete().eq('id',f.quote));
 ck(await sb.from('crm_opportunities').delete().eq('id',f.opportunity));
 const after={};for(const t of ['fee_proposals','psa_proposals','psa_proposal_blocks','quote_stages','quote_payment_schedule_items'])after[t]=ck(await sb.from(t).select('*').order('id'));
 const leftovers=ck(await sb.from('fee_proposals').select('id').like('titulo','[QA DISPOSABLE]%'));return {after,leftovers,projectRemoval:removal};}""",{'f':fixture,'project':converted['project']['id']})
  baseline=json.loads((D/'setup.json').read_text())['before']
  differences={}
  for table,rows in baseline.items():
   byid={r['id']:r for r in result['after'][table]}
   differences[table]=[r['id'] for r in rows if byid.get(r['id'])!=r]
  result['differences']=differences;(D/'cleanup.json').write_text(json.dumps(result,indent=2))
  print('Cleanup',result['projectRemoval'],'leftovers',result['leftovers'],'real differences',differences)
  await browser.close()
asyncio.run(main())
