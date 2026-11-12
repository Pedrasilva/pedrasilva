DO $$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef('public.pm_retainer_create(text,uuid,text,text,integer,numeric)'::regprocedure) INTO body;
 body:=replace(body,'coalesce(d+1,''2000-01-03''::date)','CASE WHEN d IS NULL THEN ''2000-01-03''::date ELSE (date_trunc(''month'',d)+interval ''1 month'')::date END');
 body:=replace(body,'coalesce(d+1,(SELECT start_date FROM pm_projects WHERE id=_scope),current_date)','CASE WHEN d IS NULL THEN coalesce((SELECT start_date FROM pm_projects WHERE id=_scope),current_date) ELSE (date_trunc(''month'',d)+interval ''1 month'')::date END');
 EXECUTE body;
 SELECT pg_get_functiondef('public.pm_quote_calendar_stages(uuid,date)'::regprocedure) INTO body;
 body:=replace(body,'best_start:=pm_calendar_shift(best_start,0);','best_start:=pm_calendar_shift(CASE WHEN extract(day FROM best_start)=1 THEN best_start ELSE (date_trunc(''month'',best_start)+interval ''1 month'')::date END,0);');
 EXECUTE body;
END $$;