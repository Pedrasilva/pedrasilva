CREATE OR REPLACE FUNCTION public.pm_verify_tatiana_backfill() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before_entries text; before_periods text; result jsonb;
BEGIN
 SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY id)) INTO before_entries FROM public.pm_time_entries e;
 SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY id)) INTO before_periods FROM public.pm_cost_rate_periods e;
 BEGIN
  result:=public.pm_backfill_tatiana_internal();
  IF result->>'entries'<>'108' OR result->>'hours'<>'720.00' AND (result->>'hours')::numeric<>720 OR (SELECT count(*) FROM public.pm_time_entries WHERE user_id='a5053861-594d-47fc-b955-2b0ad0b87e84' AND entry_type='internal' AND cost_rate_source='overhead_salary')<>108 THEN RAISE EXCEPTION 'Verification failed'; END IF;
  RAISE EXCEPTION 'intentional rollback' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 IF before_entries IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY id)) FROM public.pm_time_entries e) OR before_periods IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY id)) FROM public.pm_cost_rate_periods e) THEN RAISE EXCEPTION 'Rollback leaked changes'; END IF;
 RETURN result || jsonb_build_object('rollback_verified',true);
END $$;
REVOKE ALL ON FUNCTION public.pm_verify_tatiana_backfill() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pm_verify_tatiana_backfill() TO service_role;