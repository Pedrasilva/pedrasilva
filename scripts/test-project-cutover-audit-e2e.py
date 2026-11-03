"""Read-only verification of cutover rollback and admin-only mutation guard."""
import asyncio,json,os
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await context.new_page()
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: session=json.load(f)
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[session['storage_key'],json.dumps(session['session'])])
  await page.reload()
  result=await page.evaluate('''async()=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const gate=await s.rpc('pm_project_access_cutover_active');if(gate.error)throw Error(gate.error.message);const attempt=await s.rpc('pm_change_project_access_cutover',{_enabled:false,_expected:false,_matrix_hash:'not-a-reviewed-matrix',_reason:'Read-only non-admin denial check'});return {active:gate.data,denied:attempt.error?.message};}''')
  assert result['active'] is False,'Rollback must leave gate OFF'
  assert result['denied']=='Forbidden','Non-admin must be rejected before any mutation'
  print('PASS: final gate OFF; non-admin cutover action Forbidden without writes')
  await browser.close()
asyncio.run(main())
