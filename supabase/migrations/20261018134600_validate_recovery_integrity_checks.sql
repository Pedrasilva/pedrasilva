DO $migration$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.pm_recover_20261018(jsonb)'::regprocedure) INTO definition;
 definition := replace(definition,$old$string_agg(to_jsonb(t)::text,'''','' '' ORDER BY to_jsonb(t)::text)$old$,$new$string_agg(to_jsonb(t)::text,'''' ORDER BY to_jsonb(t)::text)$new$);
 definition := replace(definition,'jsonb_object_length(before_hash)','(SELECT count(*) FROM jsonb_object_keys(before_hash))');
 EXECUTE definition;
END $migration$;