"""Browser-only current Hotel Chiado copy: no real writes; exact paged export parity."""
import asyncio,json,os,uuid,subprocess
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
REAL='3d0db6b3-4bf5-4681-a875-c553f8c64656'; COPY=str(uuid.uuid4())
ROOT=Path('/tmp/browser/paged-followup/final');ROOT.mkdir(parents=True,exist_ok=True)
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
  metrics=await page.locator('.proposal-pagination-frame').evaluate('f=>[...f.contentDocument.querySelectorAll(".pagedjs_page")].map((p,i)=>{let r=p.getBoundingClientRect(),h=p.querySelector(".proposal-page-header").getBoundingClientRect(),ft=p.querySelector(".proposal-page-footer").getBoundingClientRect(),num=p.querySelector("[data-footer-page]").dataset.footerPage;return {page:i+1,width:r.width,height:r.height,headerTop:h.top-r.top,footerBottom:r.bottom-ft.bottom,footerInside:ft.top>r.top&&ft.bottom<r.bottom,number:num}})')
  assert all(m['footerInside'] and abs(m['height']-1122.52)<1 for m in metrics),metrics
  bullets=await page.locator('.proposal-pagination-frame').evaluate('f=>[...f.contentDocument.querySelectorAll(".proposal-print-block:not([data-proposal-block-type=index]) ul,.proposal-print-block:not([data-proposal-block-type=index]) ol")].map(n=>({padding:parseFloat(getComputedStyle(n).paddingInlineStart),listLeft:n.getBoundingClientRect().left,itemLeft:n.firstElementChild?.getBoundingClientRect().left}))')
  assert bullets and all(n['padding']>=15 and n['itemLeft']>n['listLeft'] for n in bullets),bullets
  indexpages=await page.locator('.proposal-pagination-frame').evaluate('f=>[...f.contentDocument.querySelectorAll(".pagedjs_page")].flatMap((p,i)=>p.querySelector("[data-proposal-block-type=index]")?[i+1]:[])');assert len(indexpages)==1,indexpages
  for n in [1,2,len(metrics)]:await frame.locator('.pagedjs_page').nth(n-1).screenshot(path=str(ROOT/f'page-{n}.png'))
  baseline=await export('current-copy')
  # Use the actual top control on the copied stage block. No real proposal IDs can be written.
  await toolbar.get_by_role('button',name='Edit',exact=True).click();stage=next(r for r in state['blocks'] if r['block_type']=='stage_item');await page.locator(f'[data-proposal-block-id="{stage["id"]}"]').first.click();panel=page.locator('#proposal-split-settings')
  heading=panel.get_by_role('combobox',name='Heading level',exact=True);assert await heading.is_visible();await heading.click();await page.get_by_role('option',name='H2',exact=False).click();await ready();assert (next(r for r in state['blocks'] if r['id']==stage['id'])['content_rich']['headingLevel'])=='h2'
  await panel.screenshot(path=str(ROOT/'settings-heading.png'))
  scroll=panel.locator('[data-block-settings-scroll]');await scroll.evaluate('n=>n.scrollTop=n.scrollHeight');bottom=await scroll.evaluate('n=>({top:n.scrollTop,max:n.scrollHeight-n.clientHeight})');assert bottom['max']>0 and abs(bottom['top']-bottom['max'])<2,bottom
  await scroll.get_by_role('button',name='Delete',exact=True).click();assert await page.get_by_role('alertdialog').is_visible();await page.get_by_role('alertdialog').get_by_role('button',name='Cancel',exact=True).click()
  # Editorial nesting demonstration only: place five copied stage blocks immediately under section 3.
  stages=[r for r in state['blocks'] if r['block_type']=='stage_item'];others=[r for r in state['blocks'] if r['block_type']!='stage_item'];at=next(i for i,r in enumerate(others) if r['block_type']=='stage_list')+1
  state['blocks']=others[:at]+stages+others[at:]
  for i,r in enumerate(state['blocks']):
   r['sort_order']=(i+1)*10
   if r['block_type']=='stage_item':r['content_rich']={**(r.get('content_rich') or {}),'headingLevel':'h2'}
  await open_builder();await page.locator('.proposal-preview-toolbar').first.get_by_role('button',name='Pages',exact=True).click();await ready()
  toc=await page.frame_locator('.proposal-pagination-frame').locator('[data-proposal-block-type=index]').inner_text()
  for number,title in [('3.1','Programa'),('3.2','Estudo Prévio'),('3.3','Licenciamento'),('3.4','Projecto de Execução'),('3.5','Assistência Técnica')]:assert number in toc and title in toc,(number,toc)
  await page.frame_locator('.proposal-pagination-frame').locator('[data-proposal-block-type=index]').screenshot(path=str(ROOT/'nested-index.png'));nested=await export('nested-copy')
  preserved=[]
  for url,before in original.items():
   response=await context.request.get(url,headers=headers[url]);after=await response.json();assert before==after,'Real source changed';preserved.append({'path':urlsplit(url).path,'equal':True})
  assert not errors,errors
  result={'currentCopy':baseline,'nestedDemoCopy':nested,'footerMetrics':metrics,'indexPages':indexpages,'settingsScroll':bottom,'headingControl':'H2 saved and read back on browser copy','deleteConfirmation':'in-app dialog/cancel verified','sourcePreserved':preserved,'blockedWrites':writes,'errors':errors,'cleanup':'Browser-only fixture context destroyed; no persisted copy'}; (ROOT/'results.json').write_text(json.dumps(result,indent=2,ensure_ascii=False));print(json.dumps(result,ensure_ascii=False))
  await context.close();await browser.close()
asyncio.run(main())
