DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.pm_preview_week_plan(uuid,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'DECLARE p pm_week_plans;','#variable_conflict use_column'||chr(10)||'DECLARE p pm_week_plans;');
 EXECUTE definition;
END $migration$;