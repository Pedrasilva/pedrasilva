-- Run only with a privileged test connection. All replacement attempts roll back.
BEGIN;
DO $$
DECLARE baseline text; payload jsonb; n integer; stopped boolean := false;
  entries_before text; queue_before text;
BEGIN
  SELECT public.pm_cost_period_revision() INTO baseline;
  IF (SELECT count(*) FROM public.pm_cost_rate_periods) <> 37 THEN
    RAISE EXCEPTION 'Expected the 37 existing periods';
  END IF;
  SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY e.id)) INTO entries_before FROM public.pm_time_entries e;
  SELECT md5(COALESCE(string_agg(to_jsonb(q)::text,'|' ORDER BY q.id),'')) INTO queue_before FROM public.pm_cost_rate_rebuild_queue q;
  SELECT jsonb_agg(jsonb_build_object('resource_id',resource_id,'valid_from',valid_from,'valid_to',valid_to,'cost_rate',cost_rate,'inputs',inputs)) INTO payload FROM public.pm_cost_rate_periods;
  -- A missing resource interrupts insertion AFTER the delete/clip steps.
  BEGIN
    PERFORM public.pm_replace_cost_periods('1900-01-01',jsonb_build_array(jsonb_build_object(
      'resource_id','00000000-0000-4000-8000-000000000099','valid_from','2026-01-01',
      'valid_to',NULL,'cost_rate',10,'inputs','{}'::jsonb)),baseline);
  EXCEPTION WHEN foreign_key_violation THEN stopped := true;
  END;
  IF NOT stopped OR public.pm_cost_period_revision() <> baseline OR (SELECT count(*) FROM public.pm_cost_rate_periods) <> 37 THEN
    RAISE EXCEPTION 'Interrupted replacement did not preserve all 37 periods';
  END IF;
  -- Successful replacement path is also exercised inside a forced rollback.
  BEGIN
    n := public.pm_replace_cost_periods('1900-01-01',payload,baseline);
    IF n <> 37 THEN RAISE EXCEPTION 'Expected 37 inserted periods'; END IF;
    BEGIN
      PERFORM public.pm_replace_cost_periods('1900-01-01',payload,baseline);
      RAISE EXCEPTION 'Stale revision was accepted';
    EXCEPTION WHEN serialization_failure THEN NULL;
    END;
    RAISE EXCEPTION 'intentional test rollback' USING ERRCODE='ZX001';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
  IF public.pm_cost_period_revision() <> baseline THEN RAISE EXCEPTION 'Successful test leaked period changes'; END IF;
  IF entries_before IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY e.id)) FROM public.pm_time_entries e) THEN
    RAISE EXCEPTION 'Time entries changed'; END IF;
  IF queue_before IS DISTINCT FROM (SELECT md5(COALESCE(string_agg(to_jsonb(q)::text,'|' ORDER BY q.id),'')) FROM public.pm_cost_rate_rebuild_queue q) THEN
    RAISE EXCEPTION 'Queue changes escaped rollback'; END IF;
  IF has_function_privilege('anon','public.pm_replace_cost_periods(date,jsonb,text,uuid[])','EXECUTE')
    OR has_function_privilege('authenticated','public.pm_replace_cost_periods(date,jsonb,text,uuid[])','EXECUTE') THEN
    RAISE EXCEPTION 'Replacement exposed to application roles'; END IF;
  RAISE NOTICE 'PASS: interrupted insertion, successful forced rollback, stale revision, 37-period hash, entry/queue preservation, service-only execution';
END $$;
ROLLBACK;