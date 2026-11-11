-- Disposable rows only; the outer transaction always rolls back.
BEGIN;
DO $$
DECLARE admin_id uuid; project_id_new uuid; other_project uuid; stage_id_new uuid; denied boolean;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 INSERT INTO pm_projects(name,start_date,status) VALUES('[QA ROLLBACK] financial Gantt scope','2026-11-16','active') RETURNING id INTO project_id_new;
 INSERT INTO pm_projects(name,start_date,status) VALUES('[QA ROLLBACK] denied Gantt scope','2026-11-16','active') RETURNING id INTO other_project;
 INSERT INTO pm_stages(project_id,name,start_date,end_date,budget,color,sort_order,is_locked,is_self) VALUES(project_id_new,'Concept fixture','2026-11-16','2026-11-20',1000,'#34d399',1,false,true) RETURNING id INTO stage_id_new;
 -- Ricardo's existing global financial capability permits value editing, independent of job title.
 PERFORM set_config('request.jwt.claim.sub','a8c10bd8-856b-405d-8957-2f7cdf476864',true);
 PERFORM set_config('request.jwt.claims','{"sub":"a8c10bd8-856b-405d-8957-2f7cdf476864","role":"authenticated"}',true);
 UPDATE pm_stages SET budget=1200 WHERE id=stage_id_new;
 IF (SELECT budget FROM pm_stages WHERE id=stage_id_new)<>1200 THEN RAISE EXCEPTION 'Ricardo value did not persist'; END IF;
 -- A collaborator without the financial grant is refused by the trigger, even through permissive legacy write policies.
 PERFORM set_config('request.jwt.claim.sub','1b97dade-9a9e-4fba-b397-b8346d18d864',true);
 PERFORM set_config('request.jwt.claims','{"sub":"1b97dade-9a9e-4fba-b397-b8346d18d864","role":"authenticated"}',true);
 denied:=false;
 BEGIN UPDATE pm_stages SET budget=2000 WHERE id=stage_id_new; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Unassigned financial access wrote stage'; END IF;
 IF (SELECT budget FROM pm_stages WHERE id=stage_id_new)<>1200 THEN RAISE EXCEPTION 'Denied update changed value'; END IF;
 -- Scope grant only on the fixture, never on a real project.
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 INSERT INTO pm_project_person_access(project_id,resource_id,financials,budget_cost,expenses,supplier_fees) SELECT project_id_new,id,true,true,true,true FROM pm_resources WHERE collaborator_id IN(SELECT id FROM collaborators WHERE nome='Adalberto Duarte');
 PERFORM set_config('request.jwt.claim.sub','1b97dade-9a9e-4fba-b397-b8346d18d864',true);
 PERFORM set_config('request.jwt.claims','{"sub":"1b97dade-9a9e-4fba-b397-b8346d18d864","role":"authenticated"}',true);
 UPDATE pm_stages SET budget=1300 WHERE id=stage_id_new;
 IF (SELECT budget FROM pm_stages WHERE id=stage_id_new)<>1300 THEN RAISE EXCEPTION 'Scoped grant did not allow edit'; END IF;
 denied:=false;
 BEGIN UPDATE pm_stages SET project_id=other_project WHERE id=stage_id_new; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Cross-project move bypassed scope'; END IF;
 RAISE NOTICE 'PASS: Ricardo global edit, no-grant denial, scoped financial edit and cross-project denial';
END $$;
ROLLBACK;
