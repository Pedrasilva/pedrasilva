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
  checks=json.loads((D/'checks.json').read_text());fixture=checks['fixture']
  await page.evaluate("async()=>{const m=await import('/src/i18n/index.ts');await m.default.changeLanguage('pt-PT')}");await page.wait_for_timeout(1000)
  await page.get_by_role('button',name='Converter em projeto',exact=True).first.click()
  await page.get_by_label('Data real de início').count()
  await page.screenshot(path=str(D/'02-signed-checklist.png'))
  await page.locator('#conversion-start').fill('2026-12-21')
  print('Dialog buttons',await page.get_by_role('alertdialog').get_by_role('button').all_text_contents())
  await page.get_by_role('button',name='Pré-visualização da conversão para datas',exact=True).click();await page.wait_for_timeout(1500)
  await page.screenshot(path=str(D/'03-calendar-preview.png'))
  print('Preview state',await page.get_by_role('alertdialog').inner_text())
  await page.get_by_role('button',name='Criar projeto',exact=True).click()
  await page.wait_for_url('**/projects/**',timeout=30000);await page.wait_for_timeout(1500)
  await page.screenshot(path=str(D/'04-project.png'))
  result=await page.evaluate("""async(f)=>{const {supabase:sb}=await import('/src/integrations/supabase/client.ts');const ck=({data,error})=>{if(error)throw Error(error.message);return data};const q=ck(await sb.from('fee_proposals').select('*').eq('id',f.quote).single());const project=ck(await sb.from('pm_projects').select('*').eq('id',q.pm_project_id).single());if(q.company_id!==f.company||project.company_id!==f.company)throw Error('Company not stamped');if(project.sold_fee!==30980)throw Error('Fee changed');return {quote:q,project,lifecycle:ck(await sb.rpc('crm_quote_lifecycle',{_quote:f.quote}))}}""",fixture)
  (D/'converted.json').write_text(json.dumps(result,indent=2));print('Converted fixture',result['project']['id'],'company matches; fee',result['project']['sold_fee'])
  await page.goto('http://localhost:8080/crm/quotes/'+fixture['quote']+'?step=publish');await page.wait_for_timeout(1500)
  await page.screenshot(path=str(D/'05-linked-quote.png'))
  await browser.close()
asyncio.run(main())
