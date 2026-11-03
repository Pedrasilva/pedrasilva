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
  fixture=json.loads((D/'checks.json').read_text())['fixture']
  converted=json.loads((D/'converted.json').read_text())
  await page.goto('http://localhost:8080/crm/quotes/'+fixture['quote']+'?step=publish')
  await page.evaluate("async()=>{const m=await import('/src/i18n/index.ts');await m.default.changeLanguage('pt-PT')}")
  await page.wait_for_timeout(7000);print('Linked body',await page.locator('body').inner_text())
  await page.evaluate("async()=>{const m=await import('/src/i18n/index.ts');await m.default.changeLanguage('pt-PT')}");await page.wait_for_timeout(500)
  await page.get_by_role('link',name='Abrir projeto',exact=True).first.wait_for(timeout=30000)
  await page.screenshot(path=str(D/'05-linked-quote.png'))
  # Converted quote must not inherit later opportunity edits.
  await page.evaluate("""async(f)=>{const {supabase:sb}=await import('/src/integrations/supabase/client.ts');const ck=({data,error})=>{if(error)throw Error(error.message);return data};ck(await sb.from('crm_opportunities').update({company_id:null}).eq('id',f.opportunity));const q=ck(await sb.from('fee_proposals').select('company_id').eq('id',f.quote).single());if(q.company_id!==f.company)throw Error('Converted quote inherited company change');}""",fixture)
  # A second minimal disposable signed quote exercises the inline picker.
  inline=await page.evaluate("""async(f)=>{const {supabase:sb}=await import('/src/integrations/supabase/client.ts');const ck=({data,error})=>{if(error)throw Error(error.message);return data};const id=crypto.randomUUID();ck(await sb.from('fee_proposals').insert({id,titulo:'[QA DISPOSABLE] Inline company picker',quote_status:'approved',signed_at:'2026-11-03T00:00:00Z',company_id:null,valor:0}));return id;}""",fixture)
  (D/'inline.json').write_text(json.dumps({'quote':inline}))
  await page.goto('http://localhost:8080/crm/quotes/'+inline+'?step=publish')
  await page.evaluate("async()=>{const m=await import('/src/i18n/index.ts');await m.default.changeLanguage('pt-PT')}")
  await page.wait_for_timeout(7000);await page.evaluate("async()=>{const m=await import('/src/i18n/index.ts');await m.default.changeLanguage('pt-PT')}")
  await page.get_by_role('button',name='Converter em projeto',exact=True).first.click()
  await page.get_by_role('button',name='Selecionar a empresa cliente',exact=True).click()
  await page.get_by_role('combobox').click()
  await page.get_by_role('combobox').last.fill('SMILEPROVIDER')
  await page.screenshot(path=str(D/'06-inline-picker.png'))
  await page.get_by_role('option').filter(has_text='SMILEPROVIDER').first.click()
  await page.get_by_role('button',name='Selecionar a empresa cliente',exact=True).wait_for(state='hidden')
  assert await page.get_by_role('alertdialog').is_visible()
  await page.screenshot(path=str(D/'07-inline-company-saved.png'))
  print('Inline company picker saved without leaving dialog; converted inheritance protected')
  await browser.close()
asyncio.run(main())
