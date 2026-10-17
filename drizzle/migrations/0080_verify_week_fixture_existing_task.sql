DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.pm_verify_week_publication()'::regprocedure) INTO definition;
 definition:=replace(definition,'INSERT INTO pm_tasks(allocation_id,name) VALUES(aid,''Task history must survive'');','UPDATE pm_tasks SET name=''Task history must survive'' WHERE allocation_id=aid;');
 EXECUTE definition;
END $migration$;