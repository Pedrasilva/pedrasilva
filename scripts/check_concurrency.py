import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
D=Path(__file__).parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);page=await b.new_page(viewport={'width':1280,'height':1800});await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload();await page.wait_for_timeout(1000)
  r=await page.evaluate('''async()=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const ck=r=>{if(r.error)throw Error(r.error.message);return r.data};const p=ck(await s.from('pm_projects').insert({name:'[QA DISPOSABLE] Release concurrent splits',start_date:'2026-11-16'}).select('id').single());try{const stage=ck(await s.from('pm_stages').insert({project_id:p.id,name:'Concurrent parent',budget:1000,start_date:'2026-11-16',end_date:'2026-11-27'}).select('id').single());const results=await Promise.all([1,2].map(n=>s.from('pm_stages').insert({project_id:p.id,parent_stage_id:stage.id,name:'Concurrent '+n,budget:600,start_date:'2026-11-16',end_date:'2026-11-27'}).select('budget')));const kids=ck(await s.from('pm_stages').select('budget').eq('parent_stage_id',stage.id));if(kids.length!==1||kids[0].budget!==600||results.filter(r=>r.error).length!==1)throw Error('Concurrent cap violated');return {childCount:kids.length,allocated:600,remaining:400,rejected:results.find(r=>r.error).error.message}}finally{ck(await s.from('pm_projects').delete().eq('id',p.id))}}''');print(json.dumps(r));(D/'concurrency-results.json').write_text(json.dumps(r));await b.close()
asyncio.run(main())
