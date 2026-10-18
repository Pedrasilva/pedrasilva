-- Only disposable fixtures are written. ROLLBACK removes all of them.
BEGIN;
DO $test$
DECLARE
  admin_id uuid; staff_id uuid; outsider_id uuid; psa uuid := '00000000-0000-4000-a000-000000000001';
  other_entity uuid; project_id uuid := gen_random_uuid(); invoice_id uuid := gen_random_uuid();
  payment_id uuid := gen_random_uuid(); company_id uuid := gen_random_uuid();
  doc_psa uuid := gen_random_uuid(); doc_other uuid := gen_random_uuid();
  log_psa uuid := gen_random_uuid(); log_other uuid := gen_random_uuid(); log_company uuid := gen_random_uuid();
  uid uuid; n integer;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
  SELECT u.id INTO staff_id FROM auth.users u JOIN public.collaborators c ON lower(c.email)=lower(u.email)
    WHERE c.archived_at IS NULL AND EXISTS (SELECT 1 FROM public.user_permissions p
      WHERE p.user_id=u.id AND p.permission_key='finance.dashboard' AND p.granted)
    AND u.id<>admin_id LIMIT 1;
  SELECT m.user_id,m.entity_id INTO outsider_id,other_entity FROM public.finance_entity_members m
    JOIN auth.users u ON u.id=m.user_id WHERE m.entity_id<>psa
    AND NOT EXISTS (SELECT 1 FROM public.collaborators c WHERE lower(c.email)=lower(u.email) AND c.archived_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role='admin') LIMIT 1;
  IF admin_id IS NULL OR staff_id IS NULL OR outsider_id IS NULL THEN RAISE EXCEPTION 'Missing identity fixtures'; END IF;
  INSERT INTO public.pm_projects(id,name) VALUES(project_id,'Disposable security test');
  INSERT INTO public.pm_invoices(id,project_id,invoice_number,entity_id)
    VALUES(invoice_id,project_id,'DISPOSABLE-SECURITY-'||invoice_id,psa);
  INSERT INTO public.pm_payment_schedule_items(id,project_id,label,trigger_type,amount_type,entity_id)
    VALUES(payment_id,project_id,'Disposable security test','manual_date','fixed',psa);
  INSERT INTO public.companies(id,nome,is_supplier) VALUES(company_id,'Disposable security test',true);
  INSERT INTO public.finance_entity_companies(entity_id,company_id) VALUES(other_entity,company_id);
  INSERT INTO public.financial_documents(id,doc_type,direction,issue_date,entity_id)
    VALUES(doc_psa,'other','received',current_date,psa),(doc_other,'other','received',current_date,other_entity);
  INSERT INTO public.tax_number_change_log(id,record_table,record_id,field,old_value,new_value)
    VALUES(log_psa,'financial_documents',doc_psa,'issuer_name','Test old','Test new'),
          (log_other,'financial_documents',doc_other,'issuer_name','Test old','Test new'),
          (log_company,'companies',company_id,'foreign_tax_id','Test old','Test new');
  FOREACH uid IN ARRAY ARRAY[admin_id,staff_id,outsider_id] LOOP
    PERFORM set_config('request.jwt.claim.sub',uid::text,true);
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.pm_invoices WHERE id=invoice_id;
    IF n<>(CASE WHEN uid=outsider_id THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'Invoice boundary failed'; END IF;
    SELECT count(*) INTO n FROM public.pm_payment_schedule_items WHERE id=payment_id;
    IF n<>(CASE WHEN uid=outsider_id THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'Schedule boundary failed'; END IF;
    SELECT count(*) INTO n FROM public.tax_number_change_log WHERE id=log_psa;
    IF n<>(CASE WHEN uid=outsider_id THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'PSA tax history boundary failed'; END IF;
    SELECT count(*) INTO n FROM public.tax_number_change_log WHERE id=log_other;
    IF n<>(CASE WHEN uid=staff_id THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'Other-entity tax history boundary failed'; END IF;
    SELECT count(*) INTO n FROM public.tax_number_change_log WHERE id=log_company;
    IF n<>1 THEN RAISE EXCEPTION 'Authorized company history lost'; END IF;
    RESET ROLE;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE ns.nspname='public'
    AND a.grantee IN ('anon'::regrole,'authenticated'::regrole) AND a.privilege_type='TRUNCATE') THEN
    RAISE EXCEPTION 'Client table TRUNCATE remains';
  END IF;
  -- supabase_admin defaults are platform-owned and intentionally outside this assertion.
  -- The public-table assertion above catches grants on new tables from any creator.
  IF EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace
    AND d.defaclobjtype='r' AND a.grantee IN ('anon'::regrole,'authenticated'::regrole)
    AND a.privilege_type='TRUNCATE') THEN
    RAISE EXCEPTION 'postgres public-table default TRUNCATE remains';
  END IF;
  RAISE NOTICE 'PASS: 15 identity/row checks, all public-table TRUNCATE grants and postgres defaults; fixtures will roll back';
END $test$;
ROLLBACK;