import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
D=Path("/tmp/browser/proposal-terms-gantt-regression")
D.mkdir(parents=True, exist_ok=True)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page()
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(5000)
  f=await page.evaluate('''async()=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};const orig=ck(await s.from('psa_proposals').select('*').eq('quote_id','d73deb33-a0f9-41bb-ad4d-637cd5d159b6').order('created_at',{ascending:false}).limit(1).single());const blocks=ck(await s.from('psa_proposal_blocks').select('*').eq('proposal_id',orig.id).order('sort_order'));const {id,created_at,updated_at,locked_at,sent_at,...copy}=orig;const np=ck(await s.from('psa_proposals').insert({...copy,title:'[QA DISPOSABLE] Oleiro page breaks',status:'draft'}).select('*').single());ck(await s.from('psa_proposal_blocks').insert(blocks.map(({id,created_at,updated_at,...r})=>({...r,proposal_id:np.id,is_locked:false}))));return {id:np.id,original:orig,blocks,b1:ck(await s.rpc('pm_project_b1_gate_state'))}}''')
  try:
   for language in ['pt-PT','en']:
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
   result=await page.evaluate('''async(f)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const r=await s.from('psa_proposals').delete().eq('id',f.id);if(r.error)throw Error(r.error.message);return {unchanged:JSON.stringify((await s.from('psa_proposal_blocks').select('*').eq('proposal_id',f.original.id).order('sort_order')).data)===JSON.stringify(f.blocks),removed:(await s.from('psa_proposals').select('id').eq('id',f.id)).data.length===0,b1:(await s.rpc('pm_project_b1_gate_state')).data}}''',f);print('CLEANUP',result)
  await b.close()
asyncio.run(main())
