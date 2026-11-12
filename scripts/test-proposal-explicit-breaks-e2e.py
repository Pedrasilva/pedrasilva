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
D=Path("/tmp/browser/proposal-explicit-breaks-regression")
D.mkdir(parents=True, exist_ok=True)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page()
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(5000)
  f=await create_fixture(page, '84e54031-64db-41d8-aa30-b22d882a6017')
  try:
   await page.goto('http://localhost:8080/proposals/'+f['id']+'/composer');await page.wait_for_timeout(11000)
   for name in ['Pages','Páginas','Split']:
    btn=page.get_by_role('button',name=name,exact=True)
    if await btn.count():await btn.first.click();break
   await page.wait_for_timeout(7000)
   frame=page.frame_locator('iframe.proposal-pagination-frame');await frame.locator('.pagedjs_page').first.wait_for(timeout=15000)
   pages=await frame.locator('.pagedjs_page').evaluate_all("els=>els.map(p=>p.innerText)")
   assert not any('Índice' in t and '1. Sumário da proposta' in t for t in pages)
   print('ORIGINAL BREAK PASS')
   # Edit only the disposable copy through the inline editor, then switch immediately.
   await page.get_by_role('button',name='Edit',exact=True).click()
   scope=page.locator('.proposal-source-host [data-proposal-block-type="scope"]')
   await scope.click();ed=scope.locator('[contenteditable="true"]');await ed.wait_for()
   await ed.fill('A nossa proposta refere-se aos estudos e PROJETO DE ARQUITETURA e assistência.')
   await ed.press('Control+a');await ed.press('Control+b');await ed.press('ArrowRight')
   await page.get_by_role('button',name='Pages',exact=True).click();await page.wait_for_timeout(5000)
   txt=await frame.locator('[data-proposal-block-type="scope"]').evaluate_all("els=>els.map(n=>n.textContent).join('')")
   assert 'e PROJETO DE ARQUITETURA e' in txt,txt
   assert await frame.locator('[data-proposal-block-type="scope"] strong').count()>0
   print('IMMEDIATE EDIT / BOLD / CAPITALS / SPACING PASS')
   # Exercise each explicit boundary independently, with all legacy break hints absent.
   for kind in ['marker','before','after']:
    await assert_fixture(page, f)
    await page.evaluate("""async([id,kind])=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};ck(await s.from('psa_proposal_blocks').delete().eq('proposal_id',id));const row=(type,n,rich)=>({proposal_id:id,block_type:type,title:type==='about'?'Boundary destination':'Boundary origin',sort_order:n,source_type:'manual',is_visible:true,is_locked:false,source_ref:{},content_rich:rich,contract_relevance:'proposal_only'});const rows=[row('custom_text',10,{html:'<p>Boundary origin</p>',pageBreakAfter:kind==='after'}),row('about',30,{html:'<p>estudos e <strong>PROJETO DE ARQUITETURA</strong> e assistência.</p>',pageBreakBefore:kind==='before'})];if(kind==='marker')rows.push(row('page_break',20,{}));ck(await s.from('psa_proposal_blocks').insert(rows));}""",[f['id'],kind])
    await page.reload();await page.wait_for_timeout(6000);await page.get_by_role('button',name='Pages',exact=True).click();await page.wait_for_timeout(5000)
    frame=page.frame_locator('iframe.proposal-pagination-frame')
    data=await frame.locator('.pagedjs_page').evaluate_all("els=>els.map(p=>p.innerText)")
    assert len(data)==2,(kind,data)
    assert 'Boundary origin' in data[0] and 'Boundary destination' not in data[0]
    assert 'Boundary destination' in data[1] and 'e PROJETO DE ARQUITETURA e' in data[1]
    await frame.locator('.pagedjs_page').nth(1).screenshot(path=str(D/(kind+'-pages.png')))
    await page.get_by_role('button',name='Download',exact=True).click()
    async with page.expect_popup() as pop:
     await page.get_by_role('menuitem',name='PDF',exact=True).click()
    pdf=await pop.value;await pdf.wait_for_selector('body[data-export-page-count]');await pdf.wait_for_timeout(2500)
    exported=await pdf.locator('.pagedjs_page').evaluate_all("els=>els.map(p=>p.innerText)")
    assert data==exported,(kind,'PDF differs')
    await pdf.pdf(path=str(D/(kind+'.pdf')),format='A4',prefer_css_page_size=True,print_background=True)
    print(kind,'PAGES + PDF EXPORT PASS');await pdf.close()

  finally:
   await finish_fixture(page, f)
  await b.close()
asyncio.run(main())
