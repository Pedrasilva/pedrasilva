import asyncio,json,os,uuid,hashlib
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
import subprocess
ROOT=Path('/tmp/browser/paged-part2')/os.environ.get('RUN','base'); ROOT.mkdir(parents=True,exist_ok=True)
PATCHED={}; MARGIN=os.environ.get('MARGIN'); H2=os.environ.get('H2')
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
   if req.method=='PATCH' and '/rest/v1/psa_proposals' in url and COPY in url:
    body=json.loads(req.post_data or '{}'); 
    if 'style_settings' in body: PATCHED['style']=body['style_settings']
    writes.append('PATCH psa_proposals (echoed, not sent)'); await route.fulfill(status=200,content_type='application/json',body=json.dumps([{**body,'id':COPY}])); return
   if req.method not in ['GET','HEAD','OPTIONS'] and ('/rest/v1/' in url and '/rpc/' not in url or '/storage/v1/' in url):
    writes.append(urlsplit(url).path); await route.fulfill(status=200,content_type='application/json',body='[]'); return
   if req.method=='GET' and any('/rest/v1/'+table+'?' in url for table in ['psa_proposals','psa_proposal_blocks']):
    readheaders[url.replace(COPY,REAL)]=req.headers; response=await route.fetch(url=url.replace(COPY,REAL)); data=await response.json(); originals[url.replace(COPY,REAL)]=json.loads(json.dumps(data))
    if isinstance(data,dict) and data.get('id')==REAL:
     data['id']=COPY
     if PATCHED.get('style'): data['style_settings']=PATCHED['style']
     if MARGIN and not PATCHED.get('style'): data['style_settings']={**(data.get('style_settings') or {}),'marginLeft':int(MARGIN)}
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
  await page.locator('.proposal-preview-toolbar').first.get_by_role('button',name='Pages',exact=True).click(); await page.wait_for_timeout(1500)
  AREA="()=>{const f=document.querySelector('.proposal-pagination-frame').contentDocument;const p=f.querySelector('.pagedjs_page');return Math.round(p.querySelector('.pagedjs_area').getBoundingClientRect().left-p.getBoundingClientRect().left)}"
  before=await page.evaluate(AREA)
  sl=page.get_by_role('slider'); target=sl.nth(4)
  await target.scroll_into_view_if_needed(); await target.focus()
  start=int(await target.get_attribute('aria-valuenow'))
  trace=[]
  for _ in range(30-start):
   await page.keyboard.press('ArrowRight'); await page.wait_for_timeout(120)
   trace.append(await page.evaluate("()=>{const a=document.activeElement;return (a?.getAttribute('role')||a?.tagName)+':'+(a?.getAttribute('aria-valuenow')||'')}"))
  print('TRACE',trace)
  await page.wait_for_timeout(600); now=await target.get_attribute('aria-valuenow')
  await page.wait_for_function("document.querySelector('.proposal-paginated-preview')?.dataset.paginationStatus==='ready'",timeout=120000); await page.wait_for_timeout(1500)
  print('LIVE',json.dumps({'sliderFrom':start,'sliderTo':now,'areaLeftBeforePx':before,'areaLeftAfterPx':await page.evaluate(AREA),'writes':writes}))
  await c.close(); await b.close()
asyncio.run(main())
