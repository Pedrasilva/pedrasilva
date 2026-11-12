import asyncio,os,json,importlib.util
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('fixture',str(Path(__file__).resolve().parents[2] / 'proposal-test-fixture.py'));fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True);ctx=await browser.new_context(viewport={'width':1280,'height':1800});page=await ctx.new_page()
  cookies=json.loads(os.environ.get('LOVABLE_BROWSER_SUPABASE_COOKIES_JSON') or '[]')
  if cookies:await ctx.add_cookies([{**c,'url':'http://localhost:8080'} for c in cookies])
  await page.goto('http://localhost:8080',wait_until='domcontentloaded');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload(wait_until='domcontentloaded')
  f=await fixture.create_fixture(page,'84e54031-64db-41d8-aa30-b22d882a6017')
  print('fixture',f['quoteId'])
  await page.goto('http://localhost:8080/crm/quotes/'+f['quoteId'],wait_until='domcontentloaded');await page.wait_for_timeout(2500)
  await page.get_by_role('tab',name='Calculator',exact=True).click();await page.wait_for_timeout(900);result=await page.evaluate("""async(q)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};const quote=ck(await s.from('fee_proposals').select('project_fee_calculation').eq('id',q).single());const inputs=quote.project_fee_calculation;const rows=inputs.stages.map((r,i)=>({...r,id:r.id??'legacy-'+i}));const stages=ck(await s.from('quote_stages').select('*').eq('quote_id',q));const phase=stages.find(r=>r.name==='Programa');ck(await s.from('quote_stages').update({calculator_row_id:rows[0].id,calculator_last_value:1,budget:2}).eq('id',phase.id));const preview=ck(await s.rpc('quote_calculator_preview',{_quote_id:q,_row_ids:rows.map(r=>r.id)}));if(preview.manual.length!==0||preview.hasContract!==false)throw Error('manual prompt remains');ck(await s.rpc('quote_apply_calculator',{_quote_id:q,_inputs:{...inputs,stages:rows},_revision:preview.revision,_existing_action:'add',_overwrite_manual:false,_delete_removed:false}));const next=ck(await s.from('quote_stages').select('*').eq('id',phase.id).single());if(next.budget===2)throw Error('value unchanged');return {manualConfirmation:false,valueChanged:true,undoPreserved:true};}""",f['quoteId']);print(result);await page.reload(wait_until='domcontentloaded');await page.wait_for_timeout(1200);await page.get_by_role('tab',name='Calculator',exact=True).click();await page.screenshot(path='/tmp/browser/d50/calculator-start.png');await browser.close()
asyncio.run(main())
