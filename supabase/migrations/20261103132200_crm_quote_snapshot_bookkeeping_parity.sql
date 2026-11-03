-- Match both live and snapshot rows with the same timestamp normalization.
DO $patch$
DECLARE v_definition text;
BEGIN
 SELECT pg_get_functiondef('public.crm_quote_snapshot_matches(uuid,uuid)'::regprocedure) INTO v_definition;
 IF strpos(v_definition,'to_jsonb(r)-''''updated_at''''')=0 THEN RAISE EXCEPTION 'Dynamic row normalization anchor missing'; END IF;
 v_definition:=replace(v_definition,'to_jsonb(r)-''''updated_at''''','to_jsonb(r)-ARRAY[''''created_at'''',''''updated_at'''']');
 EXECUTE v_definition;
END $patch$;
