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
   const stage=check(await sb.from('pm_stages').insert({project_id:project,name:'[QA DISPOSABLE] Stage',start_date:'2026-06-01',end_date:'2026-06-09',sort_order:0,status:'active'}).select('id').single());
   const item=check(await sb.from('pm_payment_schedule_items').insert({project_id:project,entity_id:'00000000-0000-4000-a000-000000000001',stage_id:stage.id,label:'[QA DISPOSABLE] Date-only payment',trigger_type:'stage_end',direction:'inflow',amount_type:'fixed',amount_value:100,vat_rate:23,payment_offset_days:30}).select('id').single());
   const read=async()=>check(await sb.rpc('pm_project_incoming_timing',{_project:project}));
   const before=await read();if(before.rows[0].planned_invoice_date!=='2026-06-09'||before.rows[0].planned_payment_date!=='2026-07-09')throw Error('Stage end/offset mismatch');
   check(await sb.from('pm_stages').update({end_date:'2026-06-12'}).eq('id',stage.id));const moved=await read();if(moved.rows[0].planned_invoice_date!=='2026-06-12')throw Error('Live stage did not recompute');
   check(await sb.rpc('pm_change_payment_dates',{_item:item.id,_patch:{planned_invoice_date_override:'2026-06-15'},_reason:'QA date override'}));const override=await read();if(override.rows[0].planned_invoice_date!=='2026-06-15'||override.rows[0].planned_payment_date!=='2026-07-15')throw Error('Override failed');
   const denied=await sb.rpc('pm_change_payment_dates',{_item:item.id,_patch:{amount_value:999},_reason:'QA forbidden amount'});if(!denied.error)throw Error('Amount was allowed');
   check(await sb.rpc('pm_change_payment_dates',{_item:item.id,_patch:{planned_invoice_date_override:null},_reason:'QA clear'}));const cleared=await read();if(cleared.rows[0].planned_invoice_date!=='2026-06-12')throw Error('Clear failed');
   check(await sb.from('pm_payment_schedule_items').update({billing_status:'issued'}).eq('id',item.id));const frozen=await read();
   check(await sb.from('pm_stages').update({end_date:'2026-06-19'}).eq('id',stage.id));const after=await read();if(after.rows[0].planned_invoice_date!=='2026-06-12'||!after.rows[0].frozen)throw Error('Freeze failed');
   const freezeDenied=await sb.rpc('pm_change_payment_dates',{_item:item.id,_patch:{planned_invoice_date_override:'2026-07-01'},_reason:'QA frozen date'});if(!freezeDenied.error)throw Error('Frozen edit allowed');
   const final=check(await sb.from('pm_payment_schedule_items').select('amount_value,vat_rate,payment_offset_days').eq('id',item.id).single());if(final.amount_value!==100||final.vat_rate!==23||final.payment_offset_days!==30)throw Error('Commercial values changed');
   return {project,before,moved,override,cleared,frozen,after,amountDenied:denied.error.code,freezeDenied:freezeDenied.error.message,final};
  }finally{if(project)check(await sb.from('pm_projects').delete().eq('id',project));}}''')
  (D/'fixture-results.json').write_text(json.dumps(result,indent=2));print('PASS: stage end, payment offset, live move, override, clear, amount denial, first issue freeze; fixture deleted')
  await b.close()
asyncio.run(main())
