import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/chrome')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True); c=await b.new_context(viewport={'width':1740,'height':981}); page=await c.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080'); await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]); await page.evaluate("localStorage.setItem('psa-snap-last:3d0db6b3-4bf5-4681-a875-c553f8c64656',String(Date.now()))")
  writes=[]
  async def guard(route):
   req=route.request
   if req.method not in ['GET','HEAD','OPTIONS'] and ('/rest/v1/' in req.url and '/rpc/' not in req.url or '/storage/v1/' in req.url):
    writes.append(req.url.split('?')[0]); await route.fulfill(status=200,content_type='application/json',body='[]'); return
   await route.continue_()
  await page.route('**/*',guard)
  await page.goto('http://localhost:8080/crm/quotes/a9f08834-6fb2-4d4b-8bb1-730f59336da6',wait_until='domcontentloaded'); await page.wait_for_timeout(10000); await page.get_by_role('button',name='2 · Proposal builder',exact=False).click()
  await page.locator('.proposal-paginated-preview').wait_for(state='attached'); await page.wait_for_function("document.querySelector('.proposal-paginated-preview')?.dataset.paginationStatus==='ready'",timeout=120000)
  results=[]
  for width in [1024,1400,1740]:
   await page.set_viewport_size({'width':width,'height':981})
   for mode,label in [('edit','Edit'),('split','Split'),('pages','Pages')]:
    await page.locator('.proposal-preview-toolbar').first.get_by_role('button',name=label,exact=True).click(); await page.wait_for_timeout(700)
    checks={'stepbar':await page.get_by_role('button',name='1 · Estimate tools',exact=False).is_visible(),'toolbar':await page.locator('.proposal-preview-toolbar').first.is_visible(),'quoteTab':await page.get_by_role('tab',name='Proposal',exact=True).is_visible(),'rail':await page.get_by_role('navigation',name='Primary navigation').is_visible()}
    checks['panels']=await page.locator('aside').evaluate_all('(ns)=>ns.map(n=>({text:n.innerText.slice(0,35),display:getComputedStyle(n).display,x:n.getBoundingClientRect().x,right:n.getBoundingClientRect().right}))')
    checks['parentPagedStyles']=await page.locator('[data-pagedjs-inserted-styles]').count(); checks['framePages']=await page.locator('.proposal-pagination-frame').evaluate('(f)=>f.contentDocument.querySelectorAll(".pagedjs_page").length')
    assert checks['stepbar'] and checks['toolbar'] and checks['quoteTab'] and checks['rail'] and checks['parentPagedStyles']==0,checks
    assert all(n['display']!='none' and n['x']>=0 and n['right']<=width for n in checks['panels']), checks
    await page.screenshot(path=str(ROOT/f'{width}-{mode}.png')); results.append({'width':width,'mode':mode,**checks})
  first=await page.locator('.proposal-pagination-frame').evaluate('(f)=>Array.from(f.contentDocument.querySelectorAll(".pagedjs_page")).map(p=>p.querySelector("[data-proposal-block-id]")?.dataset.proposalBlockId)')
  await page.get_by_role('button',name='Download',exact=True).click()
  async with page.expect_popup() as popup:
   await page.get_by_role('menuitem',name='PDF',exact=True).click()
  pdfpage=await popup.value
  await pdfpage.wait_for_function('document.body.dataset.exportPageCount',timeout=120000)
  exported=await pdfpage.locator('.pagedjs_page').evaluate_all('(ps)=>ps.map(p=>p.querySelector("[data-proposal-block-id]")?.dataset.proposalBlockId)')
  assert first==exported,(first,exported)
  await pdfpage.pdf(path=str(ROOT/'comparison.pdf'),prefer_css_page_size=True)
  (ROOT/'results.json').write_text(json.dumps({'results':results,'errors':errors,'blockedWrites':writes,'screenFirstBlocks':first,'printFirstBlocks':exported},indent=2)); print('PASS nine chrome checks; screen/print',len(first),len(exported),'errors',errors,'blocked writes',writes)
  await b.close()
asyncio.run(main())
