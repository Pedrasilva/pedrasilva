import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
D=Path(__file__).parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page()
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.reload()
  result=await page.evaluate('''async()=>{const {supabase:sb}=await import('/src/integrations/supabase/client.ts');const check=({data,error})=>{if(error)throw Error(error.message);return data};let project=null;try{
   const p=check(await sb.from('pm_projects').insert({name:'[QA DISPOSABLE] Incoming dates',start_date:'2026-06-01',status:'active'}).select('id').single());project=p.id;
   const member='49f7a371-894d-450a-ae44-ba40f582793a';
   check(await sb.rpc('pm_change_project_team',{_project:project,_resource:member,_role:'manager',_remove:false,_reason:'QA manager default'}));
   const preview=check(await sb.rpc('pm_preview_project_access',{_project:project}));if(!preview.rows[0].financials||preview.rows[0].budget_cost||preview.rows[0].expenses||preview.rows[0].supplier_fees)throw Error('Incorrect new manager defaults');
   check(await sb.rpc('pm_change_project_access',{_project:project,_resource:member,_flags:{expenses:true},_revision:1,_reason:'QA proposed expense access'}));
   const conflict=await sb.rpc('pm_change_project_access',{_project:project,_resource:member,_flags:{expenses:false},_revision:1,_reason:'QA stale revision'});if(!conflict.error)throw Error('Stale access edit allowed');
   const bypass=await sb.from('pm_project_team').insert({project_id:project,resource_id:member,role:'support'});if(!bypass.error)throw Error('Direct team write bypass');
   const audit=check(await sb.from('pm_project_access_audit').select('id').eq('project_id',project));if(audit.length!==2)throw Error('Audit missing');
   const edited=await sb.from('pm_project_access_audit').update({reason:'tamper'}).eq('id',audit[0].id).select();if(!edited.error&&edited.data?.length)throw Error('Audit editable');
   return {project,preview,revisionDenied:conflict.error.message,directTeamDenied:bypass.error.message,auditRows:audit.length};
  }finally{if(project)check(await sb.from('pm_projects').delete().eq('id',project));}}''')
  (D/'access-results.json').write_text(json.dumps(result,indent=2));print('PASS: manager defaults, revision guard, direct team-write denial, audit append-only; fixture deleted')
  await b.close()
asyncio.run(main())
