import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
D=Path("/tmp/browser/proposal-explicit-breaks-regression")
D.mkdir(parents=True, exist_ok=True)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page()
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(5000)
  f=await page.evaluate('''async()=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};const orig=ck(await s.from('psa_proposals').select('*').eq('quote_id','d73deb33-a0f9-41bb-ad4d-637cd5d159b6').order('created_at',{ascending:false}).limit(1).single());const blocks=ck(await s.from('psa_proposal_blocks').select('*').eq('proposal_id',orig.id).order('sort_order'));const {id,created_at,updated_at,locked_at,sent_at,...copy}=orig;const np=ck(await s.from('psa_proposals').insert({...copy,title:'[QA DISPOSABLE] Oleiro page breaks',status:'draft'}).select('*').single());ck(await s.from('psa_proposal_blocks').insert(blocks.map(({id,created_at,updated_at,...r})=>({...r,proposal_id:np.id,is_locked:false}))));return {id:np.id,original:orig,blocks,b1:ck(await s.rpc('pm_project_b1_gate_state'))}}''')
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
   result=await page.evaluate('''async(f)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const r=await s.from('psa_proposals').delete().eq('id',f.id);if(r.error)throw Error(r.error.message);return {unchanged:JSON.stringify((await s.from('psa_proposal_blocks').select('*').eq('proposal_id',f.original.id).order('sort_order')).data)===JSON.stringify(f.blocks),removed:(await s.from('psa_proposals').select('id').eq('id',f.id)).data.length===0,b1:(await s.rpc('pm_project_b1_gate_state')).data}}''',f);print('CLEANUP',result)
  await b.close()
asyncio.run(main())
