-- Restore the project dependency enum cast lost in shared Gantt Phase 1.
-- Keep the deployed function, authorization, fiscal guards and quote branch otherwise byte-identical.
DO $migration$
DECLARE
 definition text;
 old_fragment constant text := '(d->>''successor_id'')::uuid,d->>''type'',coalesce((d->>''lag_days'')::integer,0)';
 new_fragment constant text := '(d->>''successor_id'')::uuid,(d->>''type'')::public.pm_dep_type,coalesce((d->>''lag_days'')::integer,0)';
BEGIN
 SELECT pg_get_functiondef('public.pm_gantt_save(text,uuid,text,jsonb,boolean)'::regprocedure) INTO definition;
 IF position(old_fragment IN definition)=0 THEN
  RAISE EXCEPTION 'Expected shared Gantt project dependency insert not found';
 END IF;
 IF (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 THEN
  RAISE EXCEPTION 'Expected exactly one project dependency enum correction';
 END IF;
 EXECUTE replace(definition,old_fragment,new_fragment);
END $migration$;
