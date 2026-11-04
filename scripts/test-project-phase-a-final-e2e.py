import asyncio,json,os,hashlib,uuid,re
from pathlib import Path
from playwright.async_api import async_playwright
D=Path('/tmp/browser/phase-a-repair');O=Path('/dev-server/docs/project-access-phase-a');M='da46fd5d-309f-4f9f-b0d6-107cd61dc907';U='32810ca9-3c97-4eee-a6b7-a8385a19c972'
async def rpc(p,n,a={}):
 r=await p.evaluate('''async([n,a])=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const {data,error}=await s.rpc(n,a);return {data,error:error?.message}}''',[n,a]);
 if r.get('error'):raise Exception(n+': '+r['error'])
 return r['data']
async def session(b,name):
 c=await b.new_context(viewport={'width':1280,'height':1800});p=await c.new_page();await p.goto('http://localhost:8080')
 if name=='admin':k=os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'];v=os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']
 else:r=json.loads((D/(name+'.json')).read_text());k=r['storage_key'];v=json.dumps(r['session'])
 await p.evaluate('([k,v])=>localStorage.setItem(k,v)',[k,v]);await p.reload();await p.wait_for_timeout(1500);return c,p
async def snap(p):
 return await p.evaluate('''async()=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const o={};for(const t of ['pm_projects','pm_stages','pm_allocations','pm_time_entries','pm_payment_schedule_items','pm_invoices','financial_documents','financial_document_lines','pm_expenses','pm_project_person_access','pm_project_team','pm_global_financial_capabilities']){const {data,error}=await s.from(t).select('*').order(t==='pm_global_financial_capabilities'?'user_id':'id');if(error)throw Error(t+': '+error.message);o[t]=data;}return o}''')
async def main():
 r={'checks':[]};active=False;fixture=None
 async with async_playwright() as pw:
  b=await pw.chromium.launch(headless=True);ac,a=await session(b,'admin');before=await snap(a);pc,pat=await session(b,'patricia')
  user=json.loads((D/'fixture-user.json').read_text());ids={k:str(uuid.uuid4()) for k in ['project','collaborator','resource','doc']};ids['email']=user['email'];ids['path']=ids['doc']+'/qa-phase-a.pdf';(D/'fixture-ids.json').write_text(json.dumps(ids))
  try:
   fixture=await a.evaluate('''async x=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const check=r=>{if(r.error)throw Error(r.error.message);return r.data};check(await s.from('collaborators').insert({id:x.collaborator,nome:'[QA DISPOSABLE] Phase A PM',email:x.email,include_in_planning:false}));const rr=check(await s.from('pm_resources').select('id').eq('collaborator_id',x.collaborator).single());x.resource=rr.id;check(await s.from('pm_projects').insert({id:x.project,name:'[QA DISPOSABLE] Phase A attachment',status:'active',start_date:'2026-11-04'}));check(await s.rpc('pm_change_project_team',{_project:x.project,_resource:x.resource,_role:'manager',_remove:false,_reason:'QA disposable attachment PM Financial ON'}));check(await s.from('financial_documents').insert({id:x.doc,project_id:x.project,doc_type:'client_invoice',direction:'issued',status:'draft',issue_date:'2026-11-04',document_number:'[QA DISPOSABLE] attachment',subtotal_ex_vat:100,total_inc_vat:100,entity_id:'00000000-0000-4000-a000-000000000001',file_path:x.path}));const pdf=new Blob(['%PDF-1.1\\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\\ntrailer<</Root 1 0 R>>\\n%%EOF'],{type:'application/pdf'});check(await s.storage.from('financial-documents').upload(x.path,pdf));return x;}''',ids)
   pv=await rpc(a,'pm_preview_project_access_cutover');ch=await rpc(a,'pm_change_project_access_cutover',{'_enabled':True,'_expected':False,'_matrix_hash':pv['matrix_hash'],'_reason':'Approved by Luis 2026-11-04 00:27 UTC — disposable attachment and final Phase A GO'});active=True;r['activation']={'revision':ch['revision'],'active':ch['active']}
   tc,pm=await session(b,'pm');area=await rpc(pm,'pm_project_viewer_areas',{'_project':ids['project']});print('PM AREAS',area);assert area['financials'] and not area['expenses'] and not area['budget_cost'] and not area['supplier_fees']
   for label,p,allow in [('Disposable PM',pm,True),('Patricia',pat,False)]:
    download=await p.evaluate('''async path=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const {data,error}=await s.storage.from('financial-documents').download(path);return {bytes:data?.size??0,error:error?.message}}''',ids['path']);r['checks'].append({'person':label,'attachment':download,'expectedAllowed':allow});assert (download['bytes']>0) is allow,'Attachment permission failure: '+label
    # Evidence without signed URLs or session secrets.
    await p.evaluate('([name,allowed,bytes])=>{document.body.replaceChildren();const h=document.createElement("h1");h.textContent=name;const out=document.createElement("p");out.textContent=allowed?`PDF recebido: ${bytes} bytes`:`PDF recusado: ${bytes} bytes`;document.body.append(h,out)}',[label,allow,download['bytes']]);await p.screenshot(path=str(O/f'final-attachment-{label.split()[0].lower()}.png'))
   # Remove fixture before the final real-user read-only checks.
   await cleanup(a,ids);fixture=None;r['fixtureRemoved']=True
   rc,rita=await session(b,'rita');mat=await rpc(a,'pm_project_access_matrix');master=next(x['project_id'] for x in mat['rows'] if 'Mastercard' in x['project'])
   for pid,allow in [(M,True),(U,False),(master,False)]:
    areas=await rpc(rita,'pm_project_viewer_areas',{'_project':pid});assert all(areas[k] is allow for k in ['financials','budget_cost','expenses','supplier_fees'])
    rows=await counts(rita,pid);assert allow or all(v==0 for v in rows.values());r['checks'].append({'person':'Rita','project':pid,'areas':areas,'apiRows':rows})
    tabs=['billing','incoming','paymentSchedule','financialSummary','consultants','expenses'] if allow else ['billing']
    for tab in tabs:
     await rita.goto(f'http://localhost:8080/projects/{pid}?tab={tab}');await rita.get_by_role('button',name='Resumo',exact=True).wait_for(timeout=45000);await rita.wait_for_timeout(1000);buttons=await rita.get_by_role('button').all_text_contents();present=[x for x in buttons if x.strip() in ['Faturação do projeto','Recebimentos','Calendário de pagamentos','Resumo financeiro','Fornecedores','Despesas']]
     print('RITA TAB',tab,'ALLOW',allow,'BUTTONS',buttons);await rita.screenshot(path=str(O/'final-current.png'));assert bool(present) is allow,'Rita tabs permission failed'
     if tab=='billing' and allow:assert not any('Criar' in x for x in buttons),'Rita fiscal mutations'
     await rita.screenshot(path=str(O/f'final-rita-{pid[:8]}-{tab}.png'))
   rows=await counts(pat,master);assert all(v==0 for v in rows.values());await pat.goto(f'http://localhost:8080/projects/{master}?tab=billing');await pat.get_by_role('button',name='Resumo',exact=True).wait_for(timeout=45000);await pat.wait_for_timeout(1000);assert not any(x.strip() in ['Faturação do projeto','Recebimentos','Calendário de pagamentos','Resumo financeiro','Fornecedores','Despesas'] for x in await pat.get_by_role('button').all_text_contents());await pat.screenshot(path=str(O/'final-patricia-off.png'));r['checks'].append({'person':'Patricia','apiRows':rows,'tabsHidden':True})
   # Each explicit global account must read every existing project across all four areas.
   for name in ['admin','tatiana','irene','ricardo']:
    gc,g=await session(b,name);seen=[]
    for project in before['pm_projects']:
     areas=await rpc(g,'pm_project_viewer_areas',{'_project':project['id']});assert all(areas[k] for k in ['financials','budget_cost','expenses','supplier_fees']),name+' global area denied';seen.append(project['id'])
    actual=await g.evaluate('''async()=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const o={};for(const t of ['pm_invoices','pm_payment_schedule_items','pm_expenses','pm_stage_supplier_costs']){const {data,error}=await s.from(t).select('id').order('id');if(error)throw Error(error.message);o[t]=data.map(x=>x.id);}return o}''')
    expected=await a.evaluate('''async()=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const o={};for(const t of ['pm_invoices','pm_payment_schedule_items','pm_expenses','pm_stage_supplier_costs']){const {data,error}=await s.from(t).select('id').order('id');if(error)throw Error(error.message);o[t]=data.map(x=>x.id);}return o}''');assert actual==expected,name+' global financial rows missing'
    await g.goto(f'http://localhost:8080/projects/{M}?tab=incoming');await g.get_by_role('button',name=re.compile('^(Resumo|Overview|Summary)$')).wait_for(timeout=45000);await g.wait_for_timeout(1000);await g.screenshot(path=str(O/f'final-global-{name}.png'));r['checks'].append({'person':name,'allProjects':len(seen),'fourAreas':True,'financialRowsMatchAdmin':True})
   r['allPassed']=True
  except Exception as e:
   r['failure']=type(e).__name__+': '+str(e)
   if active:
    pv=await rpc(a,'pm_preview_project_access_cutover');ch=await rpc(a,'pm_change_project_access_cutover',{'_enabled':False,'_expected':True,'_matrix_hash':pv['matrix_hash'],'_reason':'Immediate rollback — final permission check: '+str(e)});r['rollback']={'revision':ch['revision'],'active':ch['active']};active=False
  finally:
   if fixture:await cleanup(a,ids)
   after=await snap(a);r['realDataUnchanged']=before==after;r['finalActive']=(await rpc(a,'pm_preview_project_access_cutover'))['matrix']['active'];(O/'final-cutover-results.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2));await b.close()
async def counts(p,pid):
 return await p.evaluate('''async pid=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');const o={};for(const t of ['pm_invoices','pm_payment_schedule_items','pm_expenses','pm_stage_supplier_costs','pm_project_contract_baseline']){const {data,error}=await s.from(t).select('id').eq('project_id',pid);if(error)throw Error(error.message);o[t]=data.length;}return o}''',pid)
async def cleanup(p,x):
 await p.evaluate('''async x=>{const {supabase:s}=await import('/src/integrations/supabase/client.ts');for(const r of [await s.storage.from('financial-documents').remove([x.path]),await s.from('financial_documents').delete().eq('id',x.doc),await s.from('pm_projects').delete().eq('id',x.project),await s.from('pm_resources').delete().eq('collaborator_id',x.collaborator),await s.from('collaborators').delete().eq('id',x.collaborator),await s.from('pm_resources').delete().eq('email',x.email).is('collaborator_id',null)])if(r.error)throw Error('Fixture cleanup: '+r.error.message)}''',x)
asyncio.run(main())
