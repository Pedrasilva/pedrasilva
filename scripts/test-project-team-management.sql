-- Disposable, rolled-back database verification. No existing user permission is changed.
BEGIN;
DO $$
#variable_conflict use_variable
DECLARE
 admin_id uuid;
 actor uuid := gen_random_uuid();
 project_id uuid;
 resource_id uuid;
 revision integer;
 denied boolean;
 area text;
 flags jsonb;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
 IF admin_id IS NULL THEN RAISE EXCEPTION 'Administrator required for disposable setup'; END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 INSERT INTO public.pm_projects(name,start_date) VALUES('[QA DISPOSABLE] Team management capability','2026-11-16') RETURNING id INTO project_id;
 INSERT INTO public.pm_resources(name,team,active) VALUES('[QA DISPOSABLE] Team management collaborator','project',true) RETURNING id INTO resource_id;
 -- Admin-only assignment, no role baseline.
 INSERT INTO public.user_permissions(user_id,permission_key,scope,granted) VALUES(actor,'projects.manage_teams','all',true);
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 IF NOT public.pm_can_manage_project_teams() THEN RAISE EXCEPTION 'Granted delegate rejected'; END IF;
 PERFORM public.pm_project_team_directory();
 PERFORM public.pm_change_project_team(project_id,resource_id,'support',false,'Disposable delegate adds collaborator');
 SELECT (r->>'revision')::integer INTO revision FROM jsonb_array_elements(public.pm_preview_project_access(project_id)->'rows') r WHERE r->>'resource_id'=resource_id::text;
 FOREACH area IN ARRAY ARRAY['financials','budget_cost','expenses','supplier_fees'] LOOP
  PERFORM public.pm_change_project_access(project_id,resource_id,jsonb_build_object(area,true),revision,'Disposable delegate enables area');
  revision:=revision+1;
 END LOOP;
 SELECT to_jsonb(a) INTO flags FROM public.pm_project_person_access a WHERE a.project_id=project_id AND a.resource_id=resource_id;
 FOREACH area IN ARRAY ARRAY['financials','budget_cost','expenses','supplier_fees'] LOOP
  IF (flags->>area)::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Toggle % did not persist',area; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.pm_project_access_audit WHERE pm_project_access_audit.project_id=project_id AND pm_project_access_audit.actor=actor AND action='team_insert') THEN RAISE EXCEPTION 'Real delegate actor missing in audit'; END IF;
 denied:=false;
 BEGIN INSERT INTO public.user_permissions(user_id,permission_key,scope,granted) VALUES(gen_random_uuid(),'projects.manage_teams','all',true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Delegate can grant capability'; END IF;
 denied:=false;
 BEGIN INSERT INTO public.pm_project_team(project_id,resource_id,role) VALUES(project_id,resource_id,'co_author'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Direct unaudited team write allowed'; END IF;
 PERFORM public.pm_change_project_team(project_id,resource_id,'support',true,'Disposable delegate removes collaborator');
 IF EXISTS(SELECT 1 FROM public.pm_project_team WHERE pm_project_team.project_id=project_id) THEN RAISE EXCEPTION 'Removal did not persist'; END IF;
 -- Revoke as administrator, then verify all delegate entry points deny.
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 UPDATE public.user_permissions SET granted=false WHERE user_id=actor AND permission_key='projects.manage_teams';
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 IF public.pm_can_manage_project_teams() THEN RAISE EXCEPTION 'Revoked delegate still allowed'; END IF;
 denied:=false;
 BEGIN PERFORM public.pm_preview_project_access(project_id); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked preview allowed'; END IF;
 denied:=false;
 BEGIN PERFORM public.pm_project_team_directory(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked directory allowed'; END IF;
 denied:=false;
 BEGIN PERFORM public.pm_change_project_team(project_id,resource_id,'support',false,'Disposable denied addition'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked team write allowed'; END IF;
 denied:=false;
 BEGIN PERFORM public.pm_change_project_access(project_id,resource_id,'{"financials":false}',revision,'Disposable denied toggle'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked toggle allowed'; END IF;
 IF public.pm_project_b1_recorded_active() THEN RAISE EXCEPTION 'B1 must remain OFF'; END IF;
 RAISE NOTICE 'PASS: grant, directory, addition, four toggles, actor audit, self-grant denial, direct-write denial, removal, revoke and all denied paths; B1 OFF';
END $$;
ROLLBACK;