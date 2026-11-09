"""Browser-only current Hotel Chiado copy: no real writes; exact paged export parity."""
import asyncio,json,os,uuid,subprocess
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
REAL='3d0db6b3-4bf5-4681-a875-c553f8c64656'; COPY=str(uuid.uuid4())
ROOT=Path('/tmp/browser/master/results');ROOT.mkdir(parents=True,exist_ok=True)
GETBLOCKS='ps=>ps.map(p=>{let n=p.querySelector("[data-proposal-block-id]");return {id:n?.dataset.proposalBlockId,type:n?.dataset.proposalBlockType,text:(n?.querySelector("h1,h2,h3,h4,h5,h6")?.innerText||n?.innerText||"").trim().replace(/\\s+/g," ").slice(0,160)}})'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1790,'height':1312});page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e))); original={};headers={};mapping={}; state={'blocks':None,'proposal':None};writes=[]
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.evaluate('id=>localStorage.setItem(`psa-snap-last:${id}`,String(Date.now()))',COPY)
  async def guard(route):
   req=route.request;url=req.url;table=urlsplit(url).path.split('/')[-1]
   if req.method not in ['GET','HEAD','OPTIONS'] and ('/rest/v1/' in url and '/rpc/' not in url or '/storage/v1/' in url):
    writes.append({'method':req.method,'path':urlsplit(url).path})
    if table=='psa_proposal_blocks' and req.method=='PATCH':
     from urllib.parse import parse_qs
     target=parse_qs(urlsplit(url).query).get('id',[''])[0].replace('eq.',''); patch=req.post_data_json
     for row in state['blocks']:
      if row['id']==target:row.update(patch)
    if table=='psa_proposals' and req.method=='PATCH':state['proposal'].update(req.post_data_json)
    await route.fulfill(status=200,json=[]);return
   if req.method=='GET' and '/rest/v1/' in url and table in ['psa_proposals','psa_proposal_blocks']:
    actual=url.replace(COPY,REAL);response=await route.fetch(url=actual);data=await response.json();original.setdefault(actual,json.loads(json.dumps(data)));headers[actual]=req.headers
    if table=='psa_proposal_blocks':
     if state['blocks'] is None:
      for row in data:
       if row.get('proposal_id')==REAL:
        mapping[row['id']]=str(uuid.uuid4());row['id']=mapping[row['id']];row['proposal_id']=COPY
      state['blocks']=data
     data=state['blocks']
    else:
     def swap(row):
      if row.get('id')==REAL:
       row['id']=COPY
       if state['proposal'] is None:state['proposal']=row
       return state['proposal']
      return row
     data=[swap(row) for row in data] if isinstance(data,list) else swap(data)
    await route.fulfill(response=response,json=data);return
   await route.continue_()
  await context.route('**/*',guard)
  async def ready():
   await page.wait_for_timeout(700);await page.wait_for_function("document.querySelector('.proposal-paginated-preview')?.dataset.paginationStatus==='ready'",timeout=120000)
  async def open_builder():
   await page.goto('http://localhost:8080/crm/quotes/a9f08834-6fb2-4d4b-8bb1-730f59336da6');await page.get_by_role('button',name='2 · Proposal builder',exact=False).click();await ready()
  async def export(label):
   screen=await page.locator('.proposal-pagination-frame').evaluate('(f)=>('+GETBLOCKS+')(Array.from(f.contentDocument.querySelectorAll(".pagedjs_page")))')
   await page.get_by_role('button',name='Download',exact=True).click()
   async with page.expect_popup() as popup:await page.get_by_role('menuitem',name='PDF',exact=True).click()
   pdf=await popup.value;await pdf.wait_for_function('document.body.dataset.exportPageCount',timeout=120000);await pdf.wait_for_timeout(1500)
   printed=await pdf.locator('.pagedjs_page').evaluate_all(GETBLOCKS);assert screen==printed,(screen,printed)
   await pdf.pdf(path=str(ROOT/f'{label}.pdf'),prefer_css_page_size=True)
   info=subprocess.check_output(['pdfinfo',str(ROOT/f'{label}.pdf')],text=True);physical=int(next(l.split(':')[1] for l in info.splitlines() if l.startswith('Pages:')));assert physical==len(screen),(physical,len(screen))
   text=subprocess.check_output(['pdftotext','-layout',str(ROOT/f'{label}.pdf'),'-'],text=True).split('\f');assert all('Corpo Santo' in t for t in text[:physical]),'PDF footer absent'
   await pdf.close();return {'screenPages':len(screen),'pdfPages':physical,'screenFirstBlocks':screen,'printFirstBlocks':printed}
  await open_builder();toolbar=page.locator('.proposal-preview-toolbar').first;await toolbar.get_by_role('button',name='Pages',exact=True).click();await ready()
  assert await page.locator('[data-proposal-block-id]').first.get_attribute('data-proposal-block-id') in mapping.values()
  frame=page.frame_locator('.proposal-pagination-frame')
  results={'baseline':await export('baseline')}
  await page.get_by_role('button',name='Master page',exact=True).first.click()
  dialog=page.get_by_role('dialog');await dialog.wait_for()
  await page.wait_for_timeout(700);await page.screenshot(path=str(ROOT/'master.png'))
  await dialog.get_by_label('Left (mm)',exact=True).fill('30')
  await dialog.get_by_label('Logo width (mm)',exact=True).fill('40')
  logo=dialog.get_by_role('img',name='Logo',exact=True);box=await logo.bounding_box()
  await page.mouse.move(box['x']+10,box['y']+10);await page.mouse.down();await page.mouse.move(box['x']+25,box['y']+14,steps=8);await page.mouse.up()
  assert float(await dialog.get_by_label('Logo X (mm)',exact=True).input_value())>14
  await dialog.get_by_role('button',name='Save',exact=True).click();await ready()
  results['changed']=await export('changed')
  await page.screenshot(path=str(ROOT/'pages.png'))
  await toolbar.get_by_role('button',name='Split',exact=True).click();await ready();await page.screenshot(path=str(ROOT/'split.png'))
  await page.get_by_role('button',name='Master page',exact=True).first.click();dialog=page.get_by_role('dialog');await dialog.wait_for()
  assert await dialog.get_by_label('Left (mm)',exact=True).input_value()=='30'
  await dialog.get_by_role('button',name='First page',exact=True).click();await dialog.get_by_role('switch').first.check()
  await dialog.get_by_role('switch').nth(1).uncheck();await dialog.get_by_role('switch').nth(2).uncheck()
  await dialog.get_by_role('button',name='Save',exact=True).click();await ready()
  hidden=await page.locator('.proposal-pagination-frame').evaluate('f=>[...f.contentDocument.querySelectorAll(".proposal-generated-pagebox")].map(n=>({h:n.dataset.headerHidden,f:n.dataset.footerHidden}))')
  assert hidden[0]=={'h':'true','f':'true'} and all(n=={'h':'false','f':'false'} for n in hidden[1:]),hidden
  # Validate a readback through a fresh page load with the browser-only fixture store.
  await open_builder();assert state['proposal']['style_settings']['masterPage']['margins']['left']==30
  for url,body in original.items():
   response=await context.request.get(url,headers=headers[url]);assert await response.json()==body,'real data changed'
  assert not errors,errors
  (ROOT/'results-master.json').write_text(json.dumps({'results':results,'variant':hidden,'writesIntercepted':len(writes),'realUnchanged':True},indent=2))
  print(json.dumps({k:{'screen':v['screenPages'],'pdf':v['pdfPages']} for k,v in results.items()}));print('cover variant and readback passed; real unchanged; errors',errors)
  await browser.close()
asyncio.run(main())
