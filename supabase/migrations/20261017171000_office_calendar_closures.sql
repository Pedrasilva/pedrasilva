ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS ferias_entitled boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.collaborators.ferias_entitled IS 'False for curricular interns: office-closure days are non-working without a férias deduction.';

CREATE TABLE public.office_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  repeats_yearly boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_closures_range CHECK (end_date >= start_date AND end_date - start_date <= 60)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_closures TO authenticated;
GRANT ALL ON public.office_closures TO service_role;
ALTER TABLE public.office_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read office closures" ON public.office_closures FOR SELECT TO authenticated USING (public.is_psa_staff());
CREATE POLICY "Admins manage office closures" ON public.office_closures FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS office_closure_id uuid REFERENCES public.office_closures(id) ON DELETE SET NULL;
ALTER TABLE public.vacation_requests ADD COLUMN IF NOT EXISTS office_closure_id uuid REFERENCES public.office_closures(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vacation_requests_office_closure ON public.vacation_requests(office_closure_id) WHERE office_closure_id IS NOT NULL;

-- Working days of every closure occurrence (yearly repeats expanded up to _to),
-- excluding weekends and real public holidays.
CREATE OR REPLACE FUNCTION public.pm_office_closure_days(_to date)
RETURNS TABLE(day date, closure_id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT ON (g::date) g::date, c.id, c.name
  FROM office_closures c
  CROSS JOIN LATERAL generate_series(0, CASE WHEN c.repeats_yearly THEN greatest(0, extract(year FROM _to)::int - extract(year FROM c.start_date)::int) ELSE 0 END) y
  CROSS JOIN LATERAL generate_series(c.start_date + make_interval(years => y), c.end_date + make_interval(years => y), interval '1 day') g
  WHERE extract(isodow FROM g) < 6
    AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.data = g::date AND h.office_closure_id IS NULL)
  ORDER BY g::date, c.created_at;
$$;

-- Diff between the closures as configured and what is stored (closure rows in
-- the holiday list + closure férias). Read-only; apply re-derives the same plan.
CREATE OR REPLACE FUNCTION public.pm_office_calendar_plan()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE horizon date := make_date(extract(year FROM current_date)::int + 2, 12, 31); result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  WITH days AS (SELECT * FROM public.pm_office_closure_days(horizon)),
  people AS (
    SELECT c.id, c.nome, c.ferias_entitled, c.data_admissao,
      round(least(1, coalesce(c.daily_hours,8) * coalesce(c.days_per_week,5) / 40.0), 2) AS fraction,
      coalesce(c.dias_ferias_anuais,0) + coalesce(c.dias_ferias_extra,0) + coalesce(c.saldo_ferias_anterior,0) AS allowance
    FROM collaborators c WHERE c.archived_at IS NULL),
  cells AS (
    SELECT p.id AS collaborator_id, p.nome, d.day, d.closure_id, d.name AS closure_name, p.fraction, p.allowance,
      CASE WHEN NOT p.ferias_entitled THEN 'skip_intern'
        WHEN EXISTS (SELECT 1 FROM vacation_requests v WHERE v.collaborator_id=p.id AND v.office_closure_id IS NULL
          AND v.tipo='baixa_medica' AND v.estado IN ('aprovada','pendente') AND d.day BETWEEN v.data_inicio AND v.data_fim) THEN 'skip_sick'
        WHEN EXISTS (SELECT 1 FROM vacation_requests v WHERE v.collaborator_id=p.id AND v.office_closure_id IS NULL
          AND v.estado IN ('aprovada','pendente') AND d.day BETWEEN v.data_inicio AND v.data_fim) THEN 'skip_booked'
        ELSE 'deduct' END AS action
    FROM people p JOIN days d ON p.data_admissao IS NULL OR p.data_admissao <= d.day),
  existing AS (
    SELECT v.id, v.collaborator_id, v.data_inicio AS day, v.office_closure_id, v.dias_uteis
    FROM vacation_requests v WHERE v.office_closure_id IS NOT NULL AND v.estado='aprovada'),
  leave_rows AS (
    SELECT c.collaborator_id, c.nome, c.day, c.closure_id, c.closure_name,
      CASE WHEN c.action='deduct' AND e.id IS NOT NULL THEN 'keep' ELSE c.action END AS action,
      CASE WHEN c.action='deduct' THEN c.fraction ELSE 0 END AS days, NULL::uuid AS request_id
    FROM cells c LEFT JOIN existing e ON e.collaborator_id=c.collaborator_id AND e.day=c.day
    UNION ALL
    SELECT e.collaborator_id, col.nome, e.day, e.office_closure_id, oc.name, 'refund', e.dias_uteis, e.id
    FROM existing e JOIN collaborators col ON col.id=e.collaborator_id LEFT JOIN office_closures oc ON oc.id=e.office_closure_id
    WHERE NOT EXISTS (SELECT 1 FROM cells c WHERE c.collaborator_id=e.collaborator_id AND c.day=e.day AND c.action='deduct')),
  balances AS (
    SELECT p.id AS collaborator_id, y.yr,
      p.allowance - coalesce((SELECT sum(v.dias_uteis) FROM vacation_requests v WHERE v.collaborator_id=p.id AND v.tipo='ferias'
        AND v.estado IN ('aprovada','pendente') AND extract(year FROM v.data_inicio)=y.yr
        AND NOT EXISTS (SELECT 1 FROM leave_rows l WHERE l.request_id=v.id)),0)
        - coalesce((SELECT sum(l.days) FROM leave_rows l WHERE l.collaborator_id=p.id AND l.action='deduct' AND extract(year FROM l.day)=y.yr),0) AS remaining
    FROM people p CROSS JOIN (SELECT DISTINCT extract(year FROM day)::int yr FROM leave_rows WHERE action='deduct') y)
  SELECT jsonb_build_object(
    'holidays_add', coalesce((SELECT jsonb_agg(jsonb_build_object('day',d.day,'closure_id',d.closure_id,'name',d.name) ORDER BY d.day) FROM days d
       WHERE NOT EXISTS (SELECT 1 FROM holidays h WHERE h.data=d.day)),'[]'),
    'holidays_remove', coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'day',h.data,'name',h.nome) ORDER BY h.data) FROM holidays h
       WHERE h.office_closure_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM days d WHERE d.day=h.data)),'[]'),
    'leave', coalesce((SELECT jsonb_agg(jsonb_build_object('collaborator_id',l.collaborator_id,'name',l.nome,'day',l.day,'closure_id',l.closure_id,
       'closure_name',l.closure_name,'action',l.action,'days',l.days,'request_id',l.request_id,
       'insufficient', l.action='deduct' AND EXISTS (SELECT 1 FROM balances b WHERE b.collaborator_id=l.collaborator_id AND b.yr=extract(year FROM l.day) AND b.remaining<0))
       ORDER BY l.nome, l.day) FROM leave_rows l WHERE l.action<>'keep'),'[]')) INTO result;
  RETURN result || jsonb_build_object('token', md5(result::text));
END $$;

CREATE OR REPLACE FUNCTION public.pm_office_calendar_apply(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE plan jsonb; r jsonb; added int := 0; removed int := 0; deducted int := 0; refunded int := 0; new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('office-calendar',0));
  plan := public.pm_office_calendar_plan();
  IF plan->>'token' IS DISTINCT FROM _token THEN RAISE EXCEPTION 'calendar.stale'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(plan->'holidays_remove') LOOP
    DELETE FROM holidays WHERE id=(r->>'id')::uuid AND office_closure_id IS NOT NULL; removed := removed + 1; END LOOP;
  -- Closure days join the holiday list first, so the timesheet sync never
  -- turns closure férias into extra hours (the day is already non-working).
  FOR r IN SELECT value FROM jsonb_array_elements(plan->'holidays_add') LOOP
    INSERT INTO holidays(data,nome,tipo,office_closure_id) VALUES((r->>'day')::date, r->>'name', 'fecho_atelier', (r->>'closure_id')::uuid)
    ON CONFLICT (data) DO NOTHING; added := added + 1; END LOOP;
  PERFORM set_config('psa.leave_decide','on',true);
  FOR r IN SELECT value FROM jsonb_array_elements(plan->'leave') LOOP
    IF r->>'action'='deduct' THEN
      INSERT INTO vacation_requests(collaborator_id,data_inicio,data_fim,dias_uteis,estado,tipo,periodo,notas,aprovado_por,aprovado_em,office_closure_id)
      VALUES((r->>'collaborator_id')::uuid,(r->>'day')::date,(r->>'day')::date,(r->>'days')::numeric,'aprovada','ferias','dia_inteiro',
        'Fecho do atelier: '||(r->>'closure_name'),auth.uid(),now(),(r->>'closure_id')::uuid) RETURNING id INTO new_id;
      INSERT INTO vacation_request_history(request_id,actor_id,action,before,after,reason)
        VALUES(new_id,auth.uid(),'office_closure_deduct',NULL,r,r->>'closure_name');
      deducted := deducted + 1;
    ELSIF r->>'action'='refund' THEN
      UPDATE vacation_requests SET estado='cancelada' WHERE id=(r->>'request_id')::uuid AND office_closure_id IS NOT NULL AND estado='aprovada';
      INSERT INTO vacation_request_history(request_id,actor_id,action,before,after,reason)
        VALUES((r->>'request_id')::uuid,auth.uid(),'office_closure_refund',r,NULL,r->>'closure_name');
      refunded := refunded + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('holidays_added',added,'holidays_removed',removed,'deducted',deducted,'refunded',refunded);
END $$;
REVOKE ALL ON FUNCTION public.pm_office_closure_days(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pm_office_calendar_plan() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pm_office_calendar_apply(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_office_closure_days(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_office_calendar_plan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_office_calendar_apply(text) TO authenticated;