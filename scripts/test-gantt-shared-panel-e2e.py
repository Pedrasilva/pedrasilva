import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
D=Path(__file__).parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page()
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload()
  fixture=await page.evaluate('''async()=>{const {supabase:sb}=await import('/src/integrations/supabase/client.ts');const check=({data,error})=>{if(error)throw Error(error.message);return data};const before=check(await sb.from('pm_stages').select('*').eq('project_id','a07f12ad-5033-4c38-b26b-2077d6ffd55b'));const existing=check(await sb.from('pm_projects').select('id').eq('name','[QA DISPOSABLE] Gantt Phase 1'));for(const e of existing){check(await sb.from('pm_stages').delete().eq('project_id',e.id));check(await sb.from('pm_projects').delete().eq('id',e.id));}const project=check(await sb.from('pm_projects').insert({name:'[QA DISPOSABLE] Gantt Phase 1',start_date:'2026-11-16',status:'active'}).select('id').single());const source=before.find(s=>s.name==='Nulty Concept');if(!source)throw Error('Missing copy source');const copy={color:source.color,start_date:'2026-11-16',end_date:'2026-11-20',is_self:false,stage_role:null,is_locked:false,sort_order:2};const rows=check(await sb.from('pm_stages').insert([{...copy,project_id:project.id,name:'Nulty copy',parent_stage_id:null,source_quote_stage_id:null,budget:10100},{project_id:project.id,name:'Concept copy',start_date:'2026-11-16',end_date:'2026-11-20',is_locked:false,budget:1000,color:'#34d399',is_self:true,stage_role:'architecture',sort_order:1}]).select('id,name'));return {project:project.id,rows,before};}''')
  (D/'fixture.json').write_text(json.dumps(fixture))
  try:
   minted=json.loads(Path(os.path.expanduser('~/.cache/lovable-auth/session.json')).read_text())
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
   await page.goto('http://localhost:8080/projects/'+fixture['project']+'?tab=schedule');await page.wait_for_timeout(9000)
   await page.get_by_text('Concept copy',exact=True).first.click();await page.wait_for_timeout(700)
   await page.screenshot(path=str(D/'project-panel-before.png'))
   panel=page.locator('aside').last;print('panel',await panel.inner_text())
   inp=panel.locator('input[inputmode=decimal]').last
   await inp.click();await inp.press('ControlOrMeta+A');await inp.press('Backspace');await inp.press_sequentially('1200');await inp.press('Tab');await page.wait_for_timeout(1800)
   await page.reload();await page.wait_for_timeout(7000);await page.get_by_text('Concept copy',exact=True).first.click();await page.wait_for_timeout(500)
   await page.screenshot(path=str(D/'project-panel-after.png'))
   result=await page.evaluate('''async(id)=>{const {supabase:sb}=await import('/src/integrations/supabase/client.ts');const r=await sb.from('pm_stages').select('name,budget').eq('project_id',id);if(r.error)throw Error(r.error.message);return r.data;}''',fixture['project'])
   assert next(s['budget'] for s in result if s['name']=='Concept copy')==1200,result
   await page.get_by_text('Nulty copy',exact=True).first.click();await page.wait_for_timeout(500);await page.screenshot(path=str(D/'supplier-panel.png'))
   print('supplier panel',await page.locator('aside').last.inner_text())
   await page.goto('http://localhost:8080/projects/gantt');await page.wait_for_timeout(10000)
   section=page.get_by_text('[QA DISPOSABLE] Gantt Phase 1',exact=True).locator('xpath=ancestor::div[contains(@class,"relative")][1]')
   await section.scroll_into_view_if_needed();await section.get_by_text('Concept copy',exact=True).first.click();await page.wait_for_timeout(600);await section.screenshot(path=str(D/'global-panel.png'))
   print('PASS project value save/reload and global panel',result,'errors',errors)
  finally:
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
   await page.reload();await page.wait_for_timeout(2000)
   outcome=await page.evaluate('''async(f)=>{const {supabase:sb}=await import('/src/integrations/supabase/client.ts');const ds=await sb.from('pm_stages').delete().eq('project_id',f.project);if(ds.error)throw Error(ds.error.message);const r=await sb.from('pm_projects').delete().eq('id',f.project);if(r.error)throw Error(r.error.message);const real=await sb.from('pm_stages').select('*').eq('project_id','a07f12ad-5033-4c38-b26b-2077d6ffd55b');return {realUnchanged:JSON.stringify(real.data)===JSON.stringify(f.before),remaining:(await sb.from('pm_projects').select('id').eq('id',f.project)).data};}''',fixture)
   print('cleanup',outcome);(D/'result.json').write_text(json.dumps({'cleanup':outcome,'errors':errors}))
  await b.close()
asyncio.run(main())
