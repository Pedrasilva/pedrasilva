import asyncio,json,os,subprocess
from pathlib import Path
import importlib.util
_spec=importlib.util.spec_from_file_location("proposal_fixture",Path(__file__).with_name("proposal-test-fixture.py"))
assert _spec and _spec.loader
_fixture=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_fixture)
create_fixture=_fixture.create_fixture
assert_fixture=_fixture.assert_fixture
finish_fixture=_fixture.finish_fixture
from playwright.async_api import async_playwright
D=Path("/tmp/browser/proposal-pdf-parity")
D.mkdir(parents=True, exist_ok=True)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:print('CONSOLE',m.text) if m.type=='error' else None)
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(6000)
  f=await create_fixture(page, '3d0db6b3-4bf5-4681-a875-c553f8c64656')
  try:
   await page.goto('http://localhost:8080/proposals/'+f['id']+'/composer');await page.wait_for_timeout(12000);print('buttons',await page.get_by_role('button').all_text_contents());await page.screenshot(path=str(D/'start.png'))
   for name in ['Pages','Páginas','Split']:
    btn=page.get_by_role('button',name=name,exact=True)
    if await btn.count():await btn.first.click();break
   await page.wait_for_timeout(8000)
   frames=page.locator('iframe.proposal-pagination-frame');print('frames',await frames.count());print('pagination',await page.locator('[data-pagination-status]').evaluate_all('(els)=>els.map(e=>e.dataset.paginationStatus)'));print('errors',errors);print('NOTREADY',await page.locator('[data-live-ready=false]').evaluate_all('(els)=>els.map(e=>({type:e.dataset.proposalBlockType,text:e.innerText.slice(0,100)}))'));print('BODY',(await page.locator('body').inner_text())[-1200:]);await page.screenshot(path=str(D/'pages-state.png'));frame=page.frame_locator('iframe.proposal-pagination-frame');await frame.locator('.pagedjs_page').first.wait_for(timeout=10000);types=await frame.locator('.pagedjs_page').evaluate_all('(els)=>els.map(p=>({type:p.dataset.pageType,number:p.dataset.contentNumber,footer:p.querySelector("[data-footer-page]")?.getAttribute("data-footer-page")}))');print('pages',types);assert types[0]['type']=='cover' and types[1]['type']=='letter';assert next(x for x in types if x['type']=='content')['number']=='1';await page.screenshot(path=str(D/'pages.png'));await frame.locator('.pagedjs_page').nth(1).screenshot(path=str(D/'letter.png'))
   pages=await frame.locator('.pagedjs_page').evaluate_all("""els=>els.map(p=>({type:p.dataset.pageType,number:p.dataset.contentNumber,text:p.innerText,toc:[...p.querySelectorAll('.proposal-toc-link')].map(a=>({id:a.hash.slice(1),label:a.innerText,number:a.lastElementChild?.textContent}))}))""")
   for i in range(len(pages)):
    await frame.locator('.pagedjs_page').nth(i).screenshot(path=str(D/('screen-%02d.png'%(i+1))))
   await page.get_by_role('button',name='Download',exact=True).click()
   async with page.expect_popup() as popup:
    await page.get_by_role('menuitem',name='PDF',exact=True).click()
   pdfpage=await popup.value
   await pdfpage.wait_for_selector('body[data-export-page-count]',timeout=30000)
   await pdfpage.wait_for_timeout(5000)
   exported=await pdfpage.locator('.pagedjs_page').evaluate_all("els=>els.map(p=>({type:p.dataset.pageType,number:p.dataset.contentNumber,text:p.innerText}))")
   assert not any(x['text'].strip().endswith(('cover','letter')) for x in exported[:2])
   assert [x['number'] for x in pages[2:]]==[str(i) for i in range(1,len(pages)-1)]
   anchors=await frame.locator('.pagedjs_page').evaluate_all("els=>Object.fromEntries(els.flatMap(p=>[...p.querySelectorAll('[id]')].map(n=>[n.id,p.dataset.contentNumber])))")
   assert all(a['number']==anchors[a['id']] for x in pages for a in x['toc'])
   print('EXPORT',len(exported),'MATCH',all(x['text']==y['text'] for x,y in zip(pages,exported)))
   assert len(exported)==len(pages)
   assert all(x['text']==y['text'] for x,y in zip(pages,exported))
   await pdfpage.emulate_media(media='print')
   await pdfpage.emulate_media(media='print');await pdfpage.pdf(path=str(D/'actual.pdf'),format='A4',prefer_css_page_size=True,print_background=True)
   # Read the actual painted PDF, not just the identical exported DOM: the
   # Chromium fragmentation regression kept header nodes but dropped their paint.
   for i, sheet in enumerate(pages):
    text=subprocess.check_output(['pdftotext','-f',str(i+1),'-l',str(i+1),str(D/'actual.pdf'),'-'],text=True)
    if sheet['type']=='content':
     assert 'info@pedrasilva.com' in text and 'www.pedrasilva.com' in text, f'Missing painted header on page {i+1}'
     assert sheet['number'] in text, f'Missing content counter on page {i+1}'
    else:
     assert not sheet.get('number') and not types[i].get('footer')
   print('PAINTED PDF HEADERS PASS',len(pages),'pages',flush=True)
   (D/'pages.json').write_text(json.dumps(pages,ensure_ascii=False))
   print('PDF SAVED',flush=True)

  finally:
   await finish_fixture(page, f)
  await b.close()
asyncio.run(main())
