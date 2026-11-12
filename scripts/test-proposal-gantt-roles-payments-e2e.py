"""Gantt roles + payment plan on a separate copied quote (D46/D47). Data fixes apply to the COPY only."""
import asyncio,json,os
from pathlib import Path
import importlib.util
_spec=importlib.util.spec_from_file_location("proposal_fixture",Path(__file__).with_name("proposal-test-fixture.py"))
_fixture=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_fixture)
from playwright.async_api import async_playwright
D=Path("/tmp/browser/gantt-roles");D.mkdir(parents=True,exist_ok=True)
FIX=r'''async(f)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};
 if(f.quoteId===f.sourceQuoteId)throw Error('unsafe');
 const st=ck(await s.from('quote_stages').select('*').eq('quote_id',f.quoteId));const by=n=>st.find(x=>x.name===n);
 ck(await s.from('quote_stages').update({children_bill_independently:true}).eq('id',by('Arquitectura').id).eq('quote_id',f.quoteId));
 ck(await s.from('quote_stages').update({stage_role:'architecture'}).eq('id',by('Programa').id).eq('quote_id',f.quoteId));
 const ret=by('Avença fase de obra'),pe=by('Projecto de Execução');
 ck(await s.from('quote_stages').update({start_date:'2000-09-01',end_date:'2001-08-31',parent_stage_id:by('Construction').id}).eq('id',ret.id).eq('quote_id',f.quoteId));
 ck(await s.from('quote_stage_dependencies').insert({quote_id:f.quoteId,predecessor_stage_id:pe.id,successor_stage_id:ret.id,type:'FS',lag_days:0}));
 ck(await s.from('quote_payment_schedule_items').delete().eq('quote_id',f.quoteId));
 const names=['Programa','Estudo prévio','Anteprojeto + submissão do PIP','Licenciamento','Projecto de Execução','Concurso de construção (apoio)'];
 ck(await s.from('quote_payment_schedule_items').insert(names.map((n,i)=>({quote_id:f.quoteId,stage_id:by(n).id,label:'Conclusão de '+n,trigger_type:'stage_end',amount_type:'fixed',amount_value:Number(by(n).budget),direction:'inflow',vat_rate:23,expected_invoice_date:by(n).end_date,sort_order:i,generator_source:'by_stage_billing'}))));
 return true}'''
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page()
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(5000)
  f=await _fixture.create_fixture(page,'84e54031-64db-41d8-aa30-b22d882a6017')
  print('FIXTURE',f['quoteId'],f['id'])
  try:
   await page.evaluate(FIX,f);await _fixture.assert_fixture(page,f)
   await page.goto('http://localhost:8080/proposals/'+f['id']+'/composer');await page.wait_for_timeout(11000)
   for name in ['Pages','Páginas']:
    btn=page.get_by_role('button',name=name,exact=True)
    if await btn.count():await btn.first.click();break
   await page.wait_for_timeout(8000)
   frame=page.frame_locator('iframe.proposal-pagination-frame');await frame.locator('.pagedjs_page').first.wait_for(timeout=30000)
   info=await frame.locator('.pagedjs_page').evaluate_all("els=>els.map((p,i)=>({page:i+1,o:p.dataset.orientation||'portrait',sheets:p.querySelectorAll('[data-gantt-sheet]').length,summaries:[...p.querySelectorAll('.proposal-document-gantt-summary')].map(n=>({kind:n.dataset.ganttKind,rows:n.querySelectorAll('[data-gantt-row-id]').length})),head:p.innerText.slice(0,160).replace(/\\s+/g,' ')}))")
   (D/'pages.json').write_text(json.dumps(info,ensure_ascii=False,indent=1))
   for i in info:print(i['page'],i['o'],i['sheets'],i['summaries'],i['head'][:110])
   text='\n'.join(await frame.locator('.pagedjs_page').evaluate_all('els=>els.map(p=>p.innerText)'))
   assert 'Anexo B – ' in text and 'Anexo B 16' not in text
   assert sum(i['sheets'] for i in info)>=1 and all(i['o']=='landscape' for i in info if i['sheets'])
   assert sum(len(i['summaries']) for i in info)==2 and all(i['o']=='portrait' for i in info if i['summaries'])
   for i in info:
    if i['summaries'] or i['sheets'] or 'Total' in i['head']:await frame.locator('.pagedjs_page').nth(i['page']-1).screenshot(path=str(D/f"p{i['page']}.png"))
   pay=[l for l in text.split('\n') if 'FT ' in l or 'Total' in l or '€' in l]
   (D/'text.txt').write_text(text);print('TOTALCHK','201 840' in text.replace('\u202f',' ').replace('\xa0',' '))
  finally:
   await _fixture.finish_fixture(page,f)
  await b.close()
asyncio.run(main())
