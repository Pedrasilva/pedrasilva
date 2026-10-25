import asyncio,json,os,hashlib,re
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
R=Path(__file__).parent
CID='00000000-0000-4000-8000-00000000b601';AID='00000000-0000-4000-8000-00000000b602'
collab=dict(id=CID,nome='FIXTURE · Colaborador local',email='fixture@example.invalid',departamento='Projecto',language_preference='pt-PT')
tx=dict(id='00000000-0000-4000-8000-00000000b603',bank_account_id=AID,transaction_date='2026-10-20',value_date='2026-10-20',description='FIXTURE · Movimento local',amount=-1234.56,running_balance=4567.89,currency='EUR',status='unclassified',suggested_classification_id=None,ignored_reason=None,statement_period_id=None)
snap=dict(id='00000000-0000-4000-8000-00000000b502',collaborator_id=CID,label='FIXTURE · Simulação',reference_date='2026-10-25',is_effective=False,valor_base=1800,ss_atelier_pct=.2375,ss_colaborador_pct=.11,irs_pct=.15,meses_pagos=14,subsidio_alimentacao_diario=10.2,dias_uteis=22,ajudas_custo_anual=1200,passe_anual=480,beneficio_carro=0,beneficio_ticket=0,premio_associado=0,outros_beneficios=0,beneficio_variavel=0,plano_reforma=0,notas='Notas guardadas — não traduzir',localizacao='continente',estado_civil='solteiro',numero_titulares=1,numero_dependentes=0,dependentes_com_deficiencia=0,ano_fiscal=2026,irs_calculado_auto=False,subsidios_modo='tradicional',subsidio_alimentacao_manual=False,subsidio_alimentacao_diario_manual=10.2,effective_from='2026-10-01',effective_to=None,project_cost_effective_from=None,source='manual',import_log_id=None)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page();errs=[];blocked=[];network=[]
  page.on('pageerror',lambda e:errs.append(str(e)))
  async def intercept(route):
   req=route.request;path=urlsplit(req.url).path
   if '/rest/v1/' in path:
    data=[]
    if path.endswith('/user_roles'):data=[dict(role='admin')]
    elif path.endswith('/rpc/is_psa_staff'):data=True
    elif path.endswith('/collaborators'):data=[collab]
    elif path.endswith('/bank_accounts'):data=[dict(id=AID,account_name='FIXTURE · Conta local',bank_name='FIXTURE Bank',account_number='LOCAL',iban=None,currency='EUR',is_active=True)]
    elif path.endswith('/bank_transactions'):data=[tx]
    elif path.endswith('/rpc/pm_week_board'):data=dict(resources=[],projects=[],stages=[],allocations=[],leave=[],plan=None,draft_slots=[],my_collaborator_id=CID)
    elif path.endswith('/rpc/has_permission') or path.endswith('/rpc/has_module_permission') or path.endswith('/rpc/can_access_module') or 'can_view' in path or 'has_permission' in path:data=True
    if req.method not in ['GET','HEAD']:blocked.append(req.method+' '+path)
    network.append(path);await route.fulfill(status=200,json=data,headers={'content-range':'0-0/1'});return
   if '/_server/' in path:
    blocked.append(req.method+' '+path);await route.fulfill(status=200,json=None);return
   if req.method not in ['GET','HEAD']:
    blocked.append(req.method+' '+path);await route.fulfill(status=200,json=None);return
   await route.continue_()
  await c.route('**/*',intercept)
  if os.environ.get('LOVABLE_BROWSER_AUTH_STATUS')=='injected':
   cookies=json.loads(os.environ.get('LOVABLE_BROWSER_SUPABASE_COOKIES_JSON') or '[]')
   if cookies:await c.add_cookies([{**x,'url':'http://localhost:8080'} for x in cookies])
   await page.goto('http://localhost:8080',wait_until='domcontentloaded');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
  await page.goto('http://localhost:8080/',wait_until='domcontentloaded')
  await page.get_by_test_id('home-this-week').wait_for(timeout=25000)
  message='No valid approval for the current content'
  await page.evaluate("""async message=>{const {default:i}=await import('/src/i18n/index.ts');await i.changeLanguage('pt-PT');const {toast}=await import('/src/lib/toast.ts');toast.error(message,{id:'fixture-error',duration:60000});}""",message)
  toast=page.locator('[data-sonner-toast]').filter(has_text='Não existe uma aprovação válida para o conteúdo atual.');await toast.wait_for()
  await toast.screenshot(path=str(R/'error-toast-pt-PT.png'))
  await page.screenshot(path=str(R/'home-error-pt-PT.png'))
  await page.evaluate("""async message=>{const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');const {createRoot}=ReactDOM;const {translateError}=await import('/src/lib/translate-error.ts');const host=document.createElement('section');host.id='fixture-stored-error';host.setAttribute('role','alert');document.body.appendChild(host);createRoot(host).render(React.createElement('p',null,translateError({message,code:'P0001'})));}""",'Story frames need re-rendering, open the post and approve again')
  await page.get_by_role('alert').filter(has_text='Os frames da story precisam de nova renderização').wait_for()
  assert not errs,errs
  # All intercepted POST requests were answered locally; none reached the data service.
  (R/'results.json').write_text(json.dumps(dict(originalMessage=message,translatedToast=await toast.inner_text(),storedFailureTranslated=True,errors=errs,blockedWrites=blocked,localReadCount=len(network)),ensure_ascii=False,indent=2))
  print('Portuguese toast visible; stored failure translated; runtime errors',errs,'writes',blocked)
  await b.close()
asyncio.run(main())
