DO $$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef('public.pm_quote_calendar_stages(uuid,date)'::regprocedure) INTO body;
 body:=replace(body,'IF best_start IS NULL THEN CONTINUE; END IF;','IF best_start IS NULL THEN CONTINUE; END IF; IF EXISTS(SELECT 1 FROM quote_stages c WHERE c.parent_stage_id=(row->>''id'')::uuid) AND EXISTS(SELECT 1 FROM quote_stages c JOIN quote_stage_dependencies d ON d.successor_stage_id=c.id WHERE c.parent_stage_id=(row->>''id'')::uuid AND d.predecessor_stage_id<>(row->>''id'')::uuid) THEN CONTINUE; END IF;');
 EXECUTE body;
END $$;