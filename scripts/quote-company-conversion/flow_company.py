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
  fixture=json.loads((D/'setup.json').read_text())['fixture']
  await page.goto('http://localhost:8080/crm/quotes/'+fixture['quote']+'?step=publish');await page.wait_for_timeout(1600)
  await page.evaluate("async()=>{const m=await import('/src/i18n/index.ts');await m.default.changeLanguage('pt-PT')}");await page.wait_for_timeout(2000)
  print('Page',await page.locator('body').inner_text())
  assert await page.get_by_role('button',name='Converter em projeto',exact=True).last.is_disabled()
  await page.screenshot(path=str(D/'01-before-approval.png'))
  checks=await page.evaluate("""async(f)=>{
 const {supabase:sb}=await import('/src/integrations/supabase/client.ts');const check=({data,error})=>{if(error)throw Error(error.message);return data};
 const tables=['quote_stages','quote_stage_dependencies','quote_allocations','quote_external_services','quote_payment_schedule_items','quote_billable_hourly_rates','quote_site_trips','quote_supplier_markups','quote_stage_supplier_costs'];
 const raw={quote:check(await sb.from('fee_proposals').select('*').eq('id',f.quote).single())};for(const t of tables)raw[t]=check(await sb.from(t).select('*').eq('quote_id',f.quote));
 const blocks=check(await sb.from('psa_proposal_blocks').select('*').eq('proposal_id',f.proposal));const {data:auth}=await sb.auth.getUser();
 const snapshot=check(await sb.from('psa_proposal_snapshots').insert({proposal_id:f.proposal,kind:'sent',rev_number:1,label:'QA Rev 01',snapshot:{quote_data:{raw},blocks},created_by:auth.user.id}).select('id').single());
 f.snapshot=snapshot.id;
 const hash=check(await sb.rpc('crm_quote_content_hash',{_quote:f.quote}));
 // Explicit override is preserved; NULL/old-value rows inherit opportunity changes.
 const other=check(await sb.from('companies').select('id').neq('id',f.company).limit(1).single()).id;
 check(await sb.from('fee_proposals').update({company_id:other}).eq('id',f.quote));
 check(await sb.from('crm_opportunities').update({company_id:other}).eq('id',f.opportunity));
 check(await sb.from('crm_opportunities').update({company_id:f.company}).eq('id',f.opportunity));
 if(check(await sb.from('fee_proposals').select('company_id').eq('id',f.quote).single()).company_id!==f.company)throw Error('old value did not propagate');
 check(await sb.from('fee_proposals').update({company_id:other}).eq('id',f.quote));
 check(await sb.from('crm_opportunities').update({company_id:null}).eq('id',f.opportunity));
 if(check(await sb.from('fee_proposals').select('company_id').eq('id',f.quote).single()).company_id!==other)throw Error('override overwritten');
 check(await sb.from('fee_proposals').update({company_id:null}).eq('id',f.quote));
 check(await sb.from('crm_opportunities').update({company_id:f.company}).eq('id',f.opportunity));
 if(check(await sb.from('fee_proposals').select('company_id').eq('id',f.quote).single()).company_id!==f.company)throw Error('NULL did not inherit');
 check(await sb.from('fee_proposals').update({company_id:null}).eq('id',f.quote));
 for(const t of ['quote_stages','quote_payment_schedule_items'])check(await sb.from(t).update({updated_at:'2026-11-03T13:00:00Z'}).eq('quote_id',f.quote));
 check(await sb.from('psa_proposal_blocks').update({updated_at:'2026-11-03T13:00:00Z'}).eq('proposal_id',f.proposal));
 if(check(await sb.rpc('crm_quote_content_hash',{_quote:f.quote}))!==hash)throw Error('Linkage/timestamp changed content hash');
 if(!check(await sb.rpc('crm_quote_snapshot_matches',{_quote:f.quote,_snapshot:f.snapshot})))throw Error('Timestamp snapshot mismatch');
 // A real content edit must still fail, then restore only this disposable row.
 const b=blocks[0];check(await sb.from('psa_proposal_blocks').update({title:b.title+' QA changed'}).eq('id',b.id));
 if(check(await sb.rpc('crm_quote_snapshot_matches',{_quote:f.quote,_snapshot:f.snapshot})))throw Error('Content edit undetected');
 check(await sb.from('psa_proposal_blocks').update({title:b.title}).eq('id',b.id));
 check(await sb.rpc('crm_quote_transition',{_quote:f.quote,_action:'accept',_date:'2026-11-03',_snapshot:f.snapshot}));
 check(await sb.rpc('crm_quote_transition',{_quote:f.quote,_action:'sign',_date:'2026-11-03'}));
 const lifecycle=check(await sb.rpc('crm_quote_lifecycle',{_quote:f.quote}));if(lifecycle.missing.includes('client'))throw Error('opportunity fallback failed');
 return {fixture:f,hash,lifecycle,checks:['NULL inheritance','old value propagation','override preserved','company/hash stability','stage/payment/block timestamps ignored','content edit rejected','signed NULL-company checklist']};
 }""",fixture)
  (D/'checks.json').write_text(json.dumps(checks,indent=2));print('Database rules passed',checks['checks'])
  await page.reload();await page.wait_for_timeout(1500)
  await page.get_by_role('button',name='Converter em projeto',exact=True).first.click()
  await page.get_by_label('Data real de início').count()
  await page.screenshot(path=str(D/'02-signed-checklist.png'))
  await page.locator('#conversion-start').fill('2026-12-21')
  print('Dialog buttons',await page.get_by_role('alertdialog').get_by_role('button').all_text_contents())
  await page.get_by_role('button',name='Pré-visualizar conversão',exact=True).click();await page.wait_for_timeout(1500)
  await page.screenshot(path=str(D/'03-calendar-preview.png'))
  print('Preview state',await page.get_by_role('alertdialog').inner_text())
  await browser.close()
asyncio.run(main())
