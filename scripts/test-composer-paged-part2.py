import asyncio,json,os,uuid,hashlib
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
import subprocess
ROOT=Path('/tmp/browser/paged-part2')/os.environ.get('RUN','base'); ROOT.mkdir(parents=True,exist_ok=True)
MARGIN=os.environ.get('MARGIN'); H2=os.environ.get('H2')
REAL='3d0db6b3-4bf5-4681-a875-c553f8c64656'
COPY=str(uuid.uuid4())
_m=json.load(open(os.path.expanduser('~/.cache/lovable-auth/session.json'))) if os.environ.get('LOVABLE_BROWSER_AUTH_STATUS')!='injected' else None
SK=_m['storage_key'] if _m else os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY']; SJ=json.dumps(_m['session']) if _m else os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True); c=await b.new_context(viewport={'width':1400,'height':981}); page=await c.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e))); writes=[]; originals={}; readheaders={}; blockmap={}
  await page.goto('http://localhost:8080'); await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[SK,SJ])
  await page.evaluate('id=>localStorage.setItem(`psa-snap-last:${id}`,String(Date.now()))',COPY)
  async def guard(route):
   req=route.request; url=req.url
   if req.method not in ['GET','HEAD','OPTIONS'] and ('/rest/v1/' in url and '/rpc/' not in url or '/storage/v1/' in url):
    writes.append(urlsplit(url).path); await route.fulfill(status=200,content_type='application/json',body='[]'); return
   if req.method=='GET' and any('/rest/v1/'+table+'?' in url for table in ['psa_proposals','psa_proposal_blocks']):
    readheaders[url.replace(COPY,REAL)]=req.headers; response=await route.fetch(url=url.replace(COPY,REAL)); data=await response.json(); originals[url.replace(COPY,REAL)]=json.loads(json.dumps(data))
    if isinstance(data,dict) and data.get('id')==REAL:
     data['id']=COPY
     if MARGIN: data['style_settings']={**(data.get('style_settings') or {}),'marginLeft':int(MARGIN)}
    if isinstance(data,list):
     for row in data:
      if row.get('id')==REAL: row['id']=COPY
      if row.get('id')==COPY and MARGIN and isinstance(row.get('style_settings'),dict) is not None: row['style_settings']={**(row.get('style_settings') or {}),'marginLeft':int(MARGIN)}
      if row.get('proposal_id')==REAL and H2 and H2 in (row.get('title') or ''): row['content_rich']={**(row.get('content_rich') or {}),'headingLevel':'h2'}
      if row.get('proposal_id')==REAL:
       row['proposal_id']=COPY; old=row['id']; blockmap.setdefault(old,str(uuid.uuid4())); row['id']=blockmap[old]
    await route.fulfill(response=response,json=data); return
   await route.continue_()
  await c.route('**/*',guard)
  await page.goto('http://localhost:8080/crm/quotes/a9f08834-6fb2-4d4b-8bb1-730f59336da6',wait_until='domcontentloaded')
  await page.get_by_role('button',name='2 · Proposal builder',exact=False).click()
  await page.wait_for_function("document.querySelector('.proposal-paginated-preview')?.dataset.paginationStatus==='ready'",timeout=120000)
  toolbar=page.locator('.proposal-preview-toolbar').first
  await toolbar.get_by_role('button',name='Split',exact=True).click()
  results=[]
  for width in [1400,1740]:
   await page.set_viewport_size({'width':width,'height':981}); await page.wait_for_timeout(600)
   assert not await page.locator('#proposal-split-library').is_visible()
   assert not await page.locator('#proposal-split-settings').is_visible()
   sizes=await page.locator('[data-composer-layout="split"]').evaluate('n=>{let a=n.querySelector(".proposal-editor-visible"), b=n.querySelector(".proposal-pagination-frame").closest(".flex-1");let s=a.querySelector(".proposal-print-document");return {editor:a.clientWidth,pages:b.clientWidth,document:s.getBoundingClientRect().width,overflow:a.scrollWidth>a.clientWidth}}')
   assert abs(sizes['editor']-sizes['pages'])<=2 and not sizes['overflow'],sizes
   await page.screenshot(path=str(ROOT/f'{width}-split.png'))
   await toolbar.get_by_role('button',name='Library',exact=True).click(); await toolbar.get_by_role('button',name='Settings',exact=True).click()
   assert await page.locator('#proposal-split-library').is_visible() and await page.locator('#proposal-split-settings').is_visible()
   assert await page.locator('.proposal-editor-visible').evaluate('(n)=>n.clientWidth')==sizes['editor']
   await page.screenshot(path=str(ROOT/f'{width}-split-drawers.png'))
   await page.locator('#proposal-split-library').get_by_role('button',name='Close',exact=True).click(); await page.locator('#proposal-split-settings').get_by_role('button',name='Close',exact=True).click()
   results.append({'width':width,**sizes})
  await toolbar.get_by_role('button',name='Library',exact=True).click()
  await page.reload(wait_until='domcontentloaded'); await page.get_by_role('button',name='2 · Proposal builder',exact=False).click()
  await page.wait_for_function("document.querySelector('.proposal-paginated-preview')?.dataset.paginationStatus==='ready'",timeout=120000)
  await page.locator('.proposal-preview-toolbar').first.get_by_role('button',name='Split',exact=True).click()
  assert await page.locator('#proposal-split-library').is_visible() and not await page.locator('#proposal-split-settings').is_visible()
  await page.locator('#proposal-split-library').get_by_role('button',name='Close',exact=True).click()
  await page.locator(".proposal-preview-toolbar").first.get_by_role("button",name="Library",exact=True).click()
  await page.locator(".proposal-preview-toolbar").first.get_by_role("button",name="Settings",exact=True).click()
  await page.keyboard.press("Escape")
  assert not await page.locator("#proposal-split-library").is_visible() and not await page.locator("#proposal-split-settings").is_visible()
  # Confirm real source IDs were replaced with browser-only copy IDs.
  assert await page.locator('[data-proposal-block-id]').first.get_attribute('data-proposal-block-id') in blockmap.values()
  await page.wait_for_function("document.querySelector('.proposal-paginated-preview')?.dataset.paginationStatus==='ready'",timeout=120000)
  HDR='(d)=>Array.from(d.querySelectorAll(".pagedjs_page")).map(p=>{let l=p.querySelector(".proposal-margin-furniture .proposal-letterhead-logo")?.getBoundingClientRect(),c=p.querySelector(".proposal-margin-furniture .proposal-letterhead-contact")?.getBoundingClientRect(),pg=p.getBoundingClientRect();return l&&c?{logoLeft:Math.round(l.left-pg.left),contactRight:Math.round(pg.right-c.right),sameLine:Math.abs(l.top-c.top)<8,contactRightOfLogo:c.left>l.right}:null})'
  hs=await page.locator('.proposal-pagination-frame').evaluate('(f)=>('+HDR+')(f.contentDocument)'); assert all(h and h['sameLine'] and h['contentRightOfLogo' if False else 'contactRightOfLogo'] and h['logoLeft']<200 for h in hs),hs
  tops=await page.locator('.proposal-pagination-frame').evaluate('(f)=>Array.from(f.contentDocument.querySelectorAll(".pagedjs_page")).map(p=>Math.round(p.querySelector(".proposal-page-header").getBoundingClientRect().top-p.getBoundingClientRect().top))'); assert all(t<110 for t in tops),tops
  gaps=await page.locator('.proposal-pagination-frame').evaluate('(f)=>{let ps=Array.from(f.contentDocument.querySelectorAll(".pagedjs_page"));return ps.slice(1).map((p,i)=>Math.round(p.getBoundingClientRect().top-ps[i].getBoundingClientRect().bottom))}'); assert all(g==24 for g in gaps),gaps
  await page.locator('.proposal-preview-toolbar').first.get_by_role('button',name='Split',exact=True).click(); await page.wait_for_timeout(500); await page.screenshot(path=str(ROOT/'split-gaps.png'))
  await page.locator('.proposal-pagination-frame').evaluate('f=>f.closest(".overflow-auto,.overflow-y-auto")?.scrollBy(0,900)'); await page.wait_for_timeout(300); await page.screenshot(path=str(ROOT/'split-gaps-scrolled.png'))
  await page.locator('.proposal-preview-toolbar').first.get_by_role('button',name='Pages',exact=True).click(); await page.wait_for_timeout(800); await page.screenshot(path=str(ROOT/'pages-gaps.png'))
  await page.locator('.proposal-pagination-frame').evaluate('f=>f.closest(".overflow-auto,.overflow-y-auto")?.scrollBy(0,900)'); await page.wait_for_timeout(300); await page.screenshot(path=str(ROOT/'pages-gaps-scrolled.png'))
  getblocks='ps=>ps.map(p=>{let n=p.querySelector("[data-proposal-block-id]");return {id:n?.dataset.proposalBlockId,type:n?.dataset.proposalBlockType,text:(n?.querySelector("h1,h2,h3,h4,h5,h6")?.innerText||n?.innerText||"").trim().replace(/\\s+/g," ").slice(0,160)}})'
  screen=await page.locator('.proposal-pagination-frame').evaluate('(f)=>('+getblocks+')(Array.from(f.contentDocument.querySelectorAll(".pagedjs_page")))')
  await page.get_by_role('button',name='Download',exact=True).click()
  async with page.expect_popup() as popup: await page.get_by_role('menuitem',name='PDF',exact=True).click()
  pdfpage=await popup.value
  await pdfpage.wait_for_function('document.body.dataset.exportPageCount',timeout=120000)
  phs=await pdfpage.evaluate('('+HDR+')(document)'); assert all(h and h['sameLine'] and h['contactRightOfLogo'] for h in phs),phs
  printed=await pdfpage.locator('.pagedjs_page').evaluate_all(getblocks)
  assert screen==printed,(screen,printed)
  await pdfpage.wait_for_timeout(2500); imgs=await pdfpage.evaluate('Array.from(document.images).slice(0,3).map(i=>[i.complete,i.naturalWidth,i.getAttribute("src").slice(0,40),i.loading,getComputedStyle(i).display,document.readyState])')
  await pdfpage.pdf(path=str(ROOT/'comparison.pdf'),prefer_css_page_size=True)
  info=subprocess.check_output(["pdfinfo",str(ROOT/"comparison.pdf")],text=True); physical=int(next(line.split(":")[1] for line in info.splitlines() if line.startswith("Pages:")))
  assert physical==len(screen),(physical,len(screen))
  # Read back the real GET responses without interception; compare original content.
  preserved=[]
  for url, before in originals.items():
   response=await c.request.get(url,headers=readheaders[url]); after=await response.json()
   assert before==after,"Source content changed"
   preserved.append({'path':urlsplit(url).path,'rows':len(after),'equal':True})
  assert not errors,errors
  assert await page.locator('[data-pagedjs-inserted-styles]').count()==0
  (ROOT/'results.json').write_text(json.dumps({'fixture':COPY,'fixtureType':'browser-only proposal and blocks, live quote read-only','sizes':results,'preferenceReload':'PASS','screenPageCount':len(screen),'physicalPdfPageCount':physical,'screenFirstBlocks':screen,'printFirstBlocks':printed,'preserved':preserved,'blockedWrites':writes,'errors':errors,'cleanup':'browser context destroyed; no persisted fixture'},ensure_ascii=False,indent=2))
  print(json.dumps({'sizes':results,'screenPages':len(screen),'physicalPdfPages':physical,'firstBlocks':screen,'preserved':preserved,'blockedWrites':writes,'errors':errors,'gaps':gaps,'headers':hs[:2],'pdfHeaders':phs[:2],'pdfImgs':imgs},ensure_ascii=False))
  await c.close(); await b.close()
asyncio.run(main())
