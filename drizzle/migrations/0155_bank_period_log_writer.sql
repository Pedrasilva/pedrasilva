CREATE OR REPLACE FUNCTION public.fin_period_log_write(_period_id uuid, _action text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT entity_id INTO v_entity FROM public.bank_statement_periods WHERE id = _period_id;
  IF NOT FOUND OR NOT fin_row_visible(v_entity) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.bank_statement_period_log(period_id, entity_id, action, reason, actor)
  VALUES (_period_id, v_entity, _action, _reason, auth.uid());
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fin_period_log_write(uuid, text, text) FROM anon, public, authenticated;

CREATE OR REPLACE FUNCTION public.fin_period_lock(_period_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  w jsonb;
  p public.bank_statement_periods%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM public.bank_statement_periods WHERE id = _period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p.locked_at IS NOT NULL THEN RETURN; END IF;
  w := public.fin_period_window(_period_id);
  IF (w->>'unmatched_count')::int > 0 THEN
    RAISE EXCEPTION 'period_has_unmatched' USING ERRCODE = '23514';
  END IF;
  IF abs((w->>'matched_difference')::numeric) > 0.005 THEN
    RAISE EXCEPTION 'period_difference_not_zero' USING ERRCODE = '23514';
  END IF;
  UPDATE public.bank_statement_periods SET locked_at = now(), locked_by = auth.uid(), updated_at = now() WHERE id = _period_id;
  PERFORM public.fin_period_log_write(_period_id, 'locked', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_period_reopen(_period_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  p public.bank_statement_periods%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO p FROM public.bank_statement_periods WHERE id = _period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p.locked_at IS NULL THEN RETURN; END IF;
  UPDATE public.bank_statement_periods SET locked_at = NULL, locked_by = NULL, updated_at = now() WHERE id = _period_id;
  PERFORM public.fin_period_log_write(_period_id, 'reopened', btrim(_reason));
END;
$$;