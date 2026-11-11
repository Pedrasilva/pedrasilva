import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
D=Path(__file__).parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page()
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(1000)
  for mode in ['project','quote']:
   f=await page.evaluate('''async(mode)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};const root=ck(await s.from(mode==='project'?'pm_projects':'fee_proposals').insert(mode==='project'?{name:'[QA DISPOSABLE] Release Gantt validation',start_date:'2026-11-16'}:{titulo:'[QA DISPOSABLE] Release Gantt validation',quote_status:'draft',quote_mode_ready:true}).select('id').single());const date=mode==='project'?'2026-11-16':'2000-01-03',end=mode==='project'?'2026-11-27':'2000-01-14';const stages=ck(await s.from(mode==='project'?'pm_stages':'quote_stages').insert(['Surface A','Surface B'].map((name,i)=>({[mode==='project'?'project_id':'quote_id']:root.id,name,start_date:date,end_date:end,budget:1000,sort_order:i+1,...(mode==='quote'?{sale_source:'budget',stage_role:'architecture'}:{})}))).select('id,name'));return {mode,scope:root.id,stages};}''',mode)
   (D/'active-fixture.json').write_text(json.dumps(f))
   try:
    routes=['/projects/'+f['scope']+'?tab=schedule'] if mode=='project' else ['/crm/quotes/'+f['scope']]
    for ri,route in enumerate(routes):
     if route=='/projects/gantt':
      async def only_fixture(r):
       
       if r.request.method!='GET':await r.continue_();return
       response=await r.fetch();rows=await response.json();await r.fulfill(response=response,json=[x for x in rows if x.get('id')==f['scope']])
      await page.route('**/rest/v1/pm_projects?*',only_fixture)
      async def only_project_rpc(r):
       response=await r.fetch();rows=await response.json();await r.fulfill(response=response,json=[x for x in rows if x.get('id')==f['scope']])
      await page.route('**/rest/v1/rpc/pm_b1_projects',only_project_rpc)
     await page.goto('http://localhost:8080',timeout=30000);await page.wait_for_timeout(700);await page.goto('http://localhost:8080'+route,timeout=30000);await page.wait_for_timeout(5500)
     if mode=='quote':
      tabs=page.get_by_role('tab',name='Planning',exact=True)
      if await tabs.count():await tabs.click()
      else:await page.get_by_role('tab',name='Planeamento',exact=True).click()
      await page.wait_for_timeout(1000)
     async def panel():
      await page.get_by_text('Surface B',exact=True).first.click()
      await page.get_by_role('tab',name='Dependencies',exact=True).click()
      await page.wait_for_timeout(350)
      return page.locator('section').filter(has=page.get_by_role('heading',name='Predecessors',exact=True)).last
     async def read():
      return await page.evaluate("""async(f)=>{const {readGanttSchedule}=await import('/src/lib/projects/gantt-schedule.ts');return (await readGanttSchedule(f.mode,f.scope)).dependencies}""",f)
     async def reload_panel():
      await page.reload();await page.wait_for_timeout(4500)
      if mode=='quote':await page.get_by_role('tab',name='Planning',exact=True).click();await page.wait_for_timeout(500)
      return await panel()
     pred=await panel()
     for i,typ in enumerate(['FS','SS','FF','SF']):
      form=pred.locator('div.mt-2')
      await form.get_by_role('combobox').nth(0).click()
      await page.get_by_role('option').filter(has_text='Surface A').click()
      await form.get_by_role('combobox').nth(1).click()
      await page.get_by_role('option',name=typ,exact=True).click()
      await form.locator('input[type=number]').fill('2')
      await form.get_by_role('button').click();await page.wait_for_timeout(1800)
      state=await read();print('CREATE',mode,typ,state,flush=True)
      await page.screenshot(path=str(D/(mode+'-'+typ+'-create.png')))
      assert len(state)==1 and state[0]['type']==typ and state[0]['lag_days']==2,state
      pred=await reload_panel();state=await read();assert len(state)==1 and state[0]['type']==typ and state[0]['lag_days']==2
      row=pred.locator('li').filter(has=page.locator('input[type=number]'))
      edited=['SS','FF','SF','FS'][i]
      await row.get_by_role('combobox').click();await page.get_by_role('option',name=edited,exact=True).click();await page.wait_for_timeout(1300)
      row=pred.locator('li').filter(has=page.locator('input[type=number]'))
      await row.locator('input[type=number]').fill('-3');await row.locator('input[type=number]').press('Tab');await page.wait_for_timeout(1400)
      pred=await reload_panel();state=await read();print('EDIT RELOAD',mode,edited,state,flush=True);assert len(state)==1 and state[0]['type']==edited and state[0]['lag_days']==-3,state
      await page.screenshot(path=str(D/(mode+'-'+typ+'-edited.png')))
      await pred.locator('li').filter(has=page.locator('input[type=number]')).get_by_role('button').click();await page.wait_for_timeout(1200)
      pred=await reload_panel();state=await read();assert state==[],state
      print('PASS',mode,typ,'create lag 2 / edit '+edited+' lag -3 / delete / reload',flush=True)
   finally:
    await page.evaluate('''async(f)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const table=f.mode==='project'?'pm_projects':'fee_proposals';const r=await s.from(table).delete().eq('id',f.scope);if(r.error)throw Error(r.error.message);const check=await s.from(table).select('id').eq('id',f.scope);if(check.error||check.data.length)throw Error('fixture retained')}''',f)
    print('CLEANED',mode,f['scope'])
  await b.close()
asyncio.run(main())
