import asyncio,json,os
from pathlib import Path
import importlib.util
_spec=importlib.util.spec_from_file_location("proposal_fixture",Path(__file__).with_name("proposal-test-fixture.py"))
assert _spec and _spec.loader
_fixture=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_fixture)
create_fixture=_fixture.create_fixture
assert_fixture=_fixture.assert_fixture
finish_fixture=_fixture.finish_fixture
from playwright.async_api import async_playwright
D=Path("/tmp/browser/proposal-terms-gantt-regression")
D.mkdir(parents=True, exist_ok=True)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page()
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(5000)
  f=await create_fixture(page, '84e54031-64db-41d8-aa30-b22d882a6017')
  try:
   for language in ['pt-PT','en']:
    await assert_fixture(page, f)
    await page.evaluate("""async([id,language])=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};ck(await s.from('psa_proposals').update({language}).eq('id',id));const terms=ck(await s.from('psa_proposal_blocks').select('id,content_rich').eq('proposal_id',id).eq('block_type','appendix_general_terms'));for(const b of terms)ck(await s.from('psa_proposal_blocks').update({content_rich:{...b.content_rich,html:'',text:''}}).eq('id',b.id));const mod=await import('/src/lib/psa-proposal/general-terms-content.ts');return {ptLength:mod.PSA_GENERAL_TERMS_HTML_PT.length,enLength:mod.PSA_GENERAL_TERMS_HTML_EN.length}}""",[f['id'],language])
    await page.goto('http://localhost:8080/proposals/'+f['id']+'/composer');await page.wait_for_timeout(11000)
    for name in ['Pages','Páginas','Split']:
     btn=page.get_by_role('button',name=name,exact=True)
     if await btn.count():await btn.first.click();break
    await page.wait_for_timeout(7000)
    frame=page.frame_locator('iframe.proposal-pagination-frame');await frame.locator('.pagedjs_page').first.wait_for(timeout=20000)
    info=await frame.locator('.pagedjs_page').evaluate_all("els=>els.map((p,i)=>({page:i+1,orientation:p.dataset.orientation,width:p.offsetWidth,height:p.offsetHeight,charts:[...p.querySelectorAll('[data-gantt-sheet]')].map(n=>({kind:n.dataset.ganttKind,rows:n.querySelectorAll('[data-gantt-row-id]').length,text:n.innerText,rect:n.getBoundingClientRect().toJSON()}))}))")
    terms=await frame.locator('.psa-general-terms-columns').evaluate_all("els=>els.map(n=>n.textContent).join('')");assert ('11.6 Identificação em obra.' if language=='pt-PT' else '11.6 Site Signage.') in terms
    print('GANTT',json.dumps([i for i in info if i['charts']],ensure_ascii=False))
    assert len([i for i in info if i['charts']])==3
    for i in info:
     if i['charts']:
      assert i['orientation']=='landscape' and i['width']>i['height']
      assert len(i['charts'])==1 and i['charts'][0]['rows']>0
      await frame.locator('.pagedjs_page').nth(i['page']-1).screenshot(path=str(D/(language+'-gantt-'+i['charts'][0]['kind']+'.png')))
    await page.get_by_role('button',name='Download',exact=True).click()
    async with page.expect_popup() as pop:
     await page.get_by_role('menuitem',name='PDF',exact=True).click()
    pdf=await pop.value;await pdf.wait_for_selector('body[data-export-page-count]',state='attached',timeout=125000);await pdf.wait_for_timeout(3000)
    original=await frame.locator('.pagedjs_page').evaluate_all('els=>els.map(p=>p.innerText)');exported=await pdf.locator('.pagedjs_page').evaluate_all('els=>els.map(p=>p.innerText)');assert original==exported
    await pdf.emulate_media(media='print'); await pdf.locator('.pagedjs_page[data-orientation="landscape"]').last.screenshot(path=str(D/(language+'-export-gantt.png'))); await pdf.pdf(path=str(D/(language+'.pdf')),prefer_css_page_size=True,print_background=True)
    (D/(language+'-pages.json')).write_text(json.dumps(info,ensure_ascii=False));await pdf.close();print('PT PAGES/PDF PASS')

  finally:
   await finish_fixture(page, f)
  await b.close()
asyncio.run(main())
