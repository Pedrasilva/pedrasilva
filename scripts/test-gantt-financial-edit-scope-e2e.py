import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
D=Path(__file__).parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page()
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload()
  f=await page.evaluate('''async()=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};const p=ck(await s.from('pm_projects').insert({name:'[QA DISPOSABLE] Gantt scope denial',start_date:'2026-11-16'}).select('id').single());const stage=ck(await s.from('pm_stages').insert({project_id:p.id,name:'Scope fixture',start_date:'2026-11-16',end_date:'2026-11-20',budget:1000,color:'#34d399',is_locked:false,sort_order:1}).select('id').single());return {project:p.id,stage:stage.id};}''')
  try:
   minted=json.loads(Path(os.path.expanduser('~/.cache/lovable-auth/session.json')).read_text());await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])]);await page.reload();await page.wait_for_timeout(2000)
   result=await page.evaluate('''async(f)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const access=await s.rpc('pm_can_edit_gantt',{_project:f.project});const direct=await s.from('pm_stages').update({budget:2000}).eq('id',f.stage).select('id');return {access:access.data,directDenied:!!direct.error,detail:direct.error?.message};}''',f)
   assert result['access']==False and result['directDenied'],result
   print('no-grant denial',result)
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(1000)
   await page.evaluate('''async(f)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};const rs=ck(await s.from('pm_resources').select('id').eq('collaborator_id',(ck(await s.from('collaborators').select('id').eq('nome','Adalberto Duarte').single())).id));if(rs.length!==1)throw Error('identity ambiguity');ck(await s.rpc('pm_change_project_team',{_project:f.project,_resource:rs[0].id,_role:'support',_remove:false,_reason:'Disposable Gantt scope test'}));const rows=ck(await s.rpc('pm_preview_project_access',{_project:f.project}));const row=rows.rows.find(r=>r.resource_id===rs[0].id);ck(await s.rpc('pm_change_project_access',{_project:f.project,_resource:rs[0].id,_flags:{financials:true},_revision:row.revision,_reason:'Disposable financial grant test'}));}''',f)
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])]);await page.reload();await page.wait_for_timeout(1000)
   result2=await page.evaluate('''async(f)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const access=await s.rpc('pm_can_edit_gantt',{_project:f.project});const r=await s.from('pm_stages').update({budget:1300}).eq('id',f.stage).select('budget');return {access:access.data,error:r.error?.message,budget:r.data?.[0]?.budget};}''',f)
   assert result2['access']==True and result2['budget']==1300,result2
   print('scoped financial grant',result2);(D/'scope-results.json').write_text(json.dumps({'denial':result,'grant':result2}))
  finally:
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(1000)
   await page.evaluate('''async(f)=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const r=await s.from('pm_projects').delete().eq('id',f.project);if(r.error)throw Error(r.error.message);const n=await s.from('pm_projects').select('id').eq('id',f.project);if(n.data.length)throw Error('fixture retained');}''',f)
   print('fixture deleted including admin cascade')
  await b.close()
asyncio.run(main())
