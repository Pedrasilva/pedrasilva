-- Disposable-only safeguards; a successful transaction leaves no fixture rows.
DO $$ DECLARE p uuid := gen_random_uuid(); rejected boolean:=false; BEGIN
 INSERT INTO public.pm_projects(id,name,start_date,status,origin,finance_only) VALUES(p,'QA disposable history','2099-01-01','archived','direct',true);
 BEGIN UPDATE public.pm_projects SET status='active' WHERE id=p; EXCEPTION WHEN check_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Historical activation was not blocked'; END IF;
 rejected:=false;
 BEGIN INSERT INTO public.pm_stages(project_id,name,start_date,end_date,budget) VALUES(p,'QA stage','2099-01-01','2099-01-02',0); EXCEPTION WHEN check_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Historical stage creation was not blocked'; END IF;
 rejected:=false;
 BEGIN INSERT INTO public.fee_proposals(titulo,pm_project_id) VALUES('QA disposable quote',p); EXCEPTION WHEN check_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Historical quote creation was not blocked'; END IF;
 DELETE FROM public.pm_projects WHERE id=p;
END $$;
