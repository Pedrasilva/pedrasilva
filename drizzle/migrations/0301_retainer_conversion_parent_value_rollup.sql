DO $$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef('public.pm_convert_relative_quote(uuid,date,text)'::regprocedure) INTO body;
 body:=replace(body,'CASE WHEN EXISTS(SELECT 1 FROM quote_stages c WHERE c.parent_stage_id=s.id AND c.stage_kind=''retainer_monthly'') THEN (SELECT sum(c.budget) FROM quote_stages c WHERE c.parent_stage_id=s.id) ELSE s.budget END','CASE WHEN EXISTS(SELECT 1 FROM quote_stages c WHERE c.parent_stage_id=s.id) THEN greatest(s.budget,(SELECT sum(c.budget) FROM quote_stages c WHERE c.parent_stage_id=s.id)) ELSE s.budget END');
 EXECUTE body;
END $$;