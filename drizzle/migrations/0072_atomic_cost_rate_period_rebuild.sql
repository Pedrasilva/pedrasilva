CREATE OR REPLACE FUNCTION public.pm_cost_period_revision()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT md5(COALESCE(string_agg(to_jsonb(p)::text, '|' ORDER BY p.id), '')) FROM public.pm_cost_rate_periods p;
$$;
REVOKE ALL ON FUNCTION public.pm_cost_period_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_cost_period_revision() TO service_role;

CREATE OR REPLACE FUNCTION public.pm_replace_cost_periods(_from date, _periods jsonb, _expected_revision text, _queue_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(170017, 37) THEN
    RAISE EXCEPTION 'A cost-rate rebuild is already running; retry later' USING ERRCODE = '55P03';
  END IF;
  LOCK TABLE public.pm_cost_rate_periods IN SHARE ROW EXCLUSIVE MODE;
  IF _expected_revision IS DISTINCT FROM public.pm_cost_period_revision() THEN
    RAISE EXCEPTION 'Cost periods changed during calculation; retry the rebuild' USING ERRCODE = '40001';
  END IF;
  IF _from IS NULL OR _expected_revision IS NULL OR jsonb_typeof(_periods) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid cost-period replacement';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(_periods) AS p(resource_id uuid, valid_from date, valid_to date, cost_rate numeric, inputs jsonb)
    WHERE p.resource_id IS NULL OR p.valid_from IS NULL OR p.valid_from < _from
      OR p.cost_rate IS NULL OR p.cost_rate <= 0 OR p.cost_rate::text IN ('NaN','Infinity','-Infinity')
      OR (p.valid_to IS NOT NULL AND p.valid_to <= p.valid_from)
      OR jsonb_typeof(p.inputs) IS DISTINCT FROM 'object'
  ) THEN RAISE EXCEPTION 'Invalid cost period'; END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT resource_id, valid_from, lag(valid_to) OVER w AS previous_to, row_number() OVER w AS seq
      FROM jsonb_to_recordset(_periods) AS p(resource_id uuid, valid_from date, valid_to date)
      WINDOW w AS (PARTITION BY resource_id ORDER BY valid_from)
    ) x WHERE seq > 1 AND (previous_to IS NULL OR previous_to > valid_from)
  ) THEN RAISE EXCEPTION 'Overlapping cost periods'; END IF;
  DELETE FROM public.pm_cost_rate_periods WHERE valid_from >= _from;
  UPDATE public.pm_cost_rate_periods SET valid_to = _from
    WHERE valid_from < _from AND (valid_to IS NULL OR valid_to > _from);
  INSERT INTO public.pm_cost_rate_periods(resource_id, valid_from, valid_to, cost_rate, inputs, computed_at)
    SELECT resource_id, valid_from, valid_to, cost_rate, inputs, transaction_timestamp()
    FROM jsonb_to_recordset(_periods) AS p(resource_id uuid, valid_from date, valid_to date, cost_rate numeric, inputs jsonb);
  GET DIAGNOSTICS _n = ROW_COUNT;
  UPDATE public.pm_cost_rate_rebuild_queue SET processed_at = transaction_timestamp()
    WHERE id = ANY(_queue_ids) AND processed_at IS NULL;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.pm_replace_cost_periods(date,jsonb,text,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_replace_cost_periods(date,jsonb,text,uuid[]) TO service_role;
COMMENT ON FUNCTION public.pm_replace_cost_periods(date,jsonb,text,uuid[]) IS 'Server-only atomic period replacement and queue acknowledgement; transaction lock and optimistic revision prevent overlapping or stale rebuilds. Saved time-entry snapshots are never modified.';