import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
D=Path('/tmp/browser/gantt-phase1');D.mkdir(parents=True,exist_ok=True)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page()
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload()
  f=await page.evaluate('''async()=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};const company=ck(await s.from('companies').select('id').eq('nome','[QA DISPOSABLE] Gantt client').maybeSingle())??ck(await s.from('companies').insert({nome:'[QA DISPOSABLE] Gantt client'}).select('id').single());const q=ck(await s.from('fee_proposals').insert({titulo:'[QA DISPOSABLE] Unified Gantt conversion',company_id:company.id,quote_status:'draft'}).select('id').single());const supplier=ck(await s.from('pm_suppliers').select('id').eq('name','Nulty').single());const stages=ck(await s.from('quote_stages').insert([{quote_id:q.id,name:'Concept fixture',start_date:'2000-01-03',end_date:'2000-01-07',budget:1000,is_self:true,sale_source:'budget',stage_role:'architecture',color:'#34d399',sort_order:1},{quote_id:q.id,name:'Nulty fixture',start_date:'2000-01-03',end_date:'2000-01-07',budget:2000,is_self:false,supplier_id:supplier.id,sale_source:'budget',stage_role:'supplier_phase',color:'#34d399',sort_order:2}]).select('id'));return {quote:q.id,company:company.id,supplier:supplier.id};}''')
  (D/'conversion-fixture.json').write_text(json.dumps(f));project=None
  try:
   await page.goto('http://localhost:8080/crm/quotes/'+f['quote']);await page.wait_for_timeout(8000)
   print('quote view', (await page.locator('body').inner_text())[-1800:])
   tab=page.get_by_role('tab',name='Planning',exact=True)
   if await tab.count():await tab.click()
   else:
    tab=page.get_by_role('tab',name='Planeamento',exact=True)
    if await tab.count():await tab.click()
   await page.wait_for_timeout(2000)
   await page.get_by_text('Nulty fixture',exact=True).first.click();await page.wait_for_timeout(500);await page.screenshot(path=str(D/'crm-supplier-panel.png'))
   conversion=await page.evaluate('''async(f)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};const proposal=ck(await s.from('psa_proposals').insert({quote_id:f.quote,title:'Disposable synthetic',language:'pt-PT'}).select('id').single());const raw={quote:ck(await s.from('fee_proposals').select('*').eq('id',f.quote).single())};for(const table of ['quote_stages','quote_stage_dependencies','quote_allocations','quote_external_services','quote_payment_schedule_items','quote_billable_hourly_rates','quote_site_trips','quote_supplier_markups','quote_stage_supplier_costs'])raw[table]=ck(await s.from(table).select('*').eq('quote_id',f.quote));const snapshot=ck(await s.from('psa_proposal_snapshots').insert({proposal_id:proposal.id,kind:'sent',created_by:(await s.auth.getUser()).data.user.id,snapshot:{proposal,blocks:[],quote_data:{raw}}}).select('id').single());const state=ck(await s.rpc('crm_quote_lifecycle',{_quote:f.quote}));if(state.state==='draft')ck(await s.rpc('crm_quote_transition',{_quote:f.quote,_action:'send'}));ck(await s.rpc('crm_quote_transition',{_quote:f.quote,_action:'accept',_date:'2026-11-11',_snapshot:snapshot.id,_note:'Disposable synthetic acceptance'}));const preview=ck(await s.rpc('pm_quote_conversion_preview',{_quote:f.quote,_start:'2026-11-16'}));const converted=ck(await s.rpc('pm_convert_relative_quote',{_quote:f.quote,_start:'2026-11-16',_revision:preview.revision}));const rows=ck(await s.from('pm_stages').select('name,supplier_id,stage_role,is_self').eq('project_id',converted.id));return {project:converted.id,rows};}''',f)
   project=conversion['project'];(D/'conversion-result.json').write_text(json.dumps(conversion))
   n=next(x for x in conversion['rows'] if x['name']=='Nulty fixture');assert n['supplier_id']==f['supplier'] and n['stage_role']=='supplier_phase',conversion
   print('PASS accepted synthetic conversion preserves supplier',conversion)
   minted=json.loads(Path(os.path.expanduser('~/.cache/lovable-auth/session.json')).read_text());await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
   await page.goto('http://localhost:8080/projects/'+project+'?tab=schedule');await page.wait_for_timeout(8000);await page.get_by_text('Concept fixture',exact=True).first.click();await page.wait_for_timeout(500)
   inp=page.locator('aside').last.locator('input[inputmode=decimal]').last;await inp.fill('1200');await inp.press('Tab');await page.wait_for_timeout(1500);await page.reload();await page.wait_for_timeout(7000);await page.get_by_text('Concept fixture',exact=True).first.click();await page.wait_for_timeout(300);await page.screenshot(path=str(D/'converted-ricardo-panel.png'))
   verification=await page.evaluate("""async([f,p])=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const live=await s.from('pm_stages').select('budget').eq('project_id',p).eq('name','Concept fixture').single();const quote=await s.from('quote_stages').select('budget').eq('quote_id',f.quote).eq('name','Concept fixture').single();return {live:live.data?.budget,quote:quote.data?.budget};}""",[f,project])
   assert verification=={'live':1200,'quote':1000},verification
   print('PASS Ricardo converted edit/reload, accepted quote unchanged',verification)

  finally:
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(1000)
   await page.evaluate('''async([f,p])=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};if(p){ck(await s.from('pm_stages').delete().eq('project_id',p));ck(await s.from('pm_projects').delete().eq('id',p));}ck(await s.from('fee_proposals').delete().eq('id',f.quote));ck(await s.from('companies').delete().eq('id',f.company));}''',[f,project]);print('conversion fixture cleanup complete')
  await b.close()
asyncio.run(main())
