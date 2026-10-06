ALTER TABLE public.vacation_requests DROP CONSTRAINT IF EXISTS vacation_requests_estado_check;
ALTER TABLE public.vacation_requests ADD CONSTRAINT vacation_requests_estado_check CHECK (estado = ANY (ARRAY['pendente','aprovada','rejeitada','cancelada']));

CREATE TABLE public.vacation_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.vacation_requests(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cancel','dates','type')),
  new_data_inicio date,
  new_data_fim date,
  new_periodo text,
  new_horas numeric,
  new_tipo public.absence_type,
  new_dias_uteis numeric,
  explanation text NOT NULL,
  recipient_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceite','recusada')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vacation_change_requests_one_pending ON public.vacation_change_requests(request_id) WHERE status = 'pendente';
GRANT SELECT ON public.vacation_change_requests TO authenticated;
GRANT ALL ON public.vacation_change_requests TO service_role;
ALTER TABLE public.vacation_change_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.vacation_request_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.vacation_requests(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vacation_request_history_req ON public.vacation_request_history(request_id, created_at);
GRANT SELECT ON public.vacation_request_history TO authenticated;
GRANT ALL ON public.vacation_request_history TO service_role;
ALTER TABLE public.vacation_request_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_approve_leave(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_module_permission(_uid, 'hr.leave.approve', 'all')
$$;

CREATE OR REPLACE FUNCTION public.leave_request_owner_user(_collab uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id FROM public.collaborators c JOIN auth.users u ON lower(u.email) = lower(c.email)
  WHERE c.id = _collab LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.leave_request_owner_user(uuid) FROM anon, authenticated;

CREATE POLICY "Change requests visible to requester, recipient, approvers"
  ON public.vacation_change_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR recipient_id = auth.uid() OR public.can_approve_leave(auth.uid())
    OR EXISTS (SELECT 1 FROM public.vacation_requests v WHERE v.id = request_id AND v.collaborator_id = public.get_my_collaborator_id()));

CREATE POLICY "History visible to owner and approvers"
  ON public.vacation_request_history FOR SELECT TO authenticated
  USING (public.can_approve_leave(auth.uid())
    OR EXISTS (SELECT 1 FROM public.vacation_requests v WHERE v.id = request_id AND v.collaborator_id = public.get_my_collaborator_id())
    OR EXISTS (SELECT 1 FROM public.vacation_change_requests c WHERE c.request_id = vacation_request_history.request_id AND c.recipient_id = auth.uid()));

-- Approvers may see every request (needed to act on change requests / direct edits)
CREATE POLICY "Leave approvers see all requests" ON public.vacation_requests FOR SELECT TO authenticated
  USING (public.can_approve_leave(auth.uid()));

CREATE OR REPLACE FUNCTION public.list_leave_approvers()
RETURNS TABLE(user_id uuid, nome text, email text, is_default boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT public.get_my_collaborator_id() AS cid)
  SELECT u.id, COALESCE(c.nome, u.email)::text, u.email::text,
    EXISTS (SELECT 1 FROM public.remote_work_approvers a, me
            WHERE a.approver_user_id = u.id AND a.collaborator_id = me.cid AND a.active) AS is_default
  FROM auth.users u
  LEFT JOIN public.collaborators c ON lower(c.email) = lower(u.email) AND c.archived_at IS NULL
  WHERE auth.uid() IS NOT NULL AND u.id <> auth.uid() AND public.can_approve_leave(u.id)
  ORDER BY 4 DESC, 2
$$;

CREATE OR REPLACE FUNCTION public.leave_overlaps(_collab uuid, _exclude uuid, _start date, _end date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.vacation_requests v
    WHERE v.collaborator_id = _collab AND v.id <> _exclude AND v.estado IN ('pendente','aprovada')
      AND v.data_inicio <= _end AND v.data_fim >= _start)
$$;

CREATE OR REPLACE FUNCTION public.leave_notify(_user uuid, _kind text, _title text, _body text, _req uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, kind, title, body, link_path, module, entity_type, entity_id)
  SELECT _user, _kind, _title, _body, '/hr/ferias?req=' || _req::text, 'hr', 'vacation_request', _req
  WHERE _user IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION public.leave_notify(uuid,text,text,text,uuid) FROM anon, authenticated;

-- Applies a change to a request (internal).
CREATE OR REPLACE FUNCTION public.leave_apply_change(_req uuid, _kind text, _start date, _end date, _periodo text, _horas numeric, _tipo public.absence_type, _dias numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _kind = 'cancel' THEN
    UPDATE public.vacation_requests SET estado = 'cancelada' WHERE id = _req;
  ELSIF _kind = 'dates' THEN
    UPDATE public.vacation_requests SET data_inicio = _start, data_fim = _end,
      periodo = COALESCE(_periodo, periodo), horas = _horas, dias_uteis = COALESCE(_dias, dias_uteis) WHERE id = _req;
  ELSIF _kind = 'type' THEN
    UPDATE public.vacation_requests SET tipo = _tipo WHERE id = _req;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.leave_apply_change(uuid,text,date,date,text,numeric,public.absence_type,numeric) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.leave_change_submit(_req uuid, _kind text, _start date, _end date, _periodo text, _horas numeric, _tipo public.absence_type, _dias numeric, _explanation text, _recipient uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.vacation_requests; v_id uuid; v_name text;
BEGIN
  SELECT * INTO v FROM public.vacation_requests WHERE id = _req;
  IF v.id IS NULL OR v.collaborator_id IS DISTINCT FROM public.get_my_collaborator_id() THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF v.estado <> 'aprovada' THEN RAISE EXCEPTION 'not_approved'; END IF;
  IF coalesce(trim(_explanation),'') = '' THEN RAISE EXCEPTION 'explanation_required'; END IF;
  IF _recipient = auth.uid() OR NOT public.can_approve_leave(_recipient) THEN RAISE EXCEPTION 'invalid_recipient'; END IF;
  IF _kind = 'dates' THEN
    IF _start IS NULL OR _end IS NULL OR _end < _start THEN RAISE EXCEPTION 'invalid_dates'; END IF;
    IF public.leave_overlaps(v.collaborator_id, v.id, _start, _end) THEN RAISE EXCEPTION 'overlap'; END IF;
  ELSIF _kind = 'type' AND _tipo IS NULL THEN RAISE EXCEPTION 'invalid_type';
  END IF;
  INSERT INTO public.vacation_change_requests(request_id, requested_by, kind, new_data_inicio, new_data_fim, new_periodo, new_horas, new_tipo, new_dias_uteis, explanation, recipient_id)
  VALUES (_req, auth.uid(), _kind, _start, _end, _periodo, _horas, _tipo, _dias, trim(_explanation), _recipient) RETURNING id INTO v_id;
  INSERT INTO public.vacation_request_history(request_id, actor_id, action, after, reason)
  VALUES (_req, auth.uid(), 'change_requested', jsonb_build_object('kind',_kind,'data_inicio',_start,'data_fim',_end,'periodo',_periodo,'horas',_horas,'tipo',_tipo), trim(_explanation));
  SELECT nome INTO v_name FROM public.collaborators WHERE id = v.collaborator_id;
  PERFORM public.leave_notify(_recipient, 'leave_change_requested', 'Pedido de alteração de ausência: ' || coalesce(v_name,''),
    v.data_inicio || ' → ' || v.data_fim || E'\n' || trim(_explanation), _req);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.leave_change_decide(_change uuid, _accept boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.vacation_change_requests; v public.vacation_requests; v2 public.vacation_requests;
BEGIN
  SELECT * INTO c FROM public.vacation_change_requests WHERE id = _change FOR UPDATE;
  IF c.id IS NULL OR c.status <> 'pendente' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF c.recipient_id <> auth.uid() OR c.requested_by = auth.uid() THEN RAISE EXCEPTION 'not_recipient'; END IF;
  SELECT * INTO v FROM public.vacation_requests WHERE id = c.request_id;
  IF NOT _accept AND coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF _accept THEN
    IF c.kind = 'dates' AND public.leave_overlaps(v.collaborator_id, v.id, c.new_data_inicio, c.new_data_fim) THEN RAISE EXCEPTION 'overlap'; END IF;
    PERFORM public.leave_apply_change(v.id, c.kind, c.new_data_inicio, c.new_data_fim, c.new_periodo, c.new_horas, c.new_tipo, c.new_dias_uteis);
    SELECT * INTO v2 FROM public.vacation_requests WHERE id = v.id;
  END IF;
  UPDATE public.vacation_change_requests SET status = CASE WHEN _accept THEN 'aceite' ELSE 'recusada' END,
    decided_by = auth.uid(), decided_at = now(), decision_reason = nullif(trim(coalesce(_reason,'')),'') WHERE id = c.id;
  INSERT INTO public.vacation_request_history(request_id, actor_id, action, before, after, reason)
  VALUES (v.id, auth.uid(), CASE WHEN _accept THEN 'change_accepted' ELSE 'change_refused' END,
    to_jsonb(v), CASE WHEN _accept THEN to_jsonb(v2) END, nullif(trim(coalesce(_reason,'')),''));
  PERFORM public.leave_notify(c.requested_by, CASE WHEN _accept THEN 'leave_change_accepted' ELSE 'leave_change_refused' END,
    CASE WHEN _accept THEN 'Alteração de ausência aceite' ELSE 'Alteração de ausência recusada' END,
    v.data_inicio || ' → ' || v.data_fim || coalesce(E'\n' || nullif(trim(coalesce(_reason,'')),''), ''), v.id);
END $$;

CREATE OR REPLACE FUNCTION public.leave_direct_change(_req uuid, _kind text, _start date, _end date, _periodo text, _horas numeric, _tipo public.absence_type, _dias numeric, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.vacation_requests; v2 public.vacation_requests;
BEGIN
  IF NOT public.can_approve_leave(auth.uid()) THEN RAISE EXCEPTION 'not_approver'; END IF;
  SELECT * INTO v FROM public.vacation_requests WHERE id = _req;
  IF v.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v.collaborator_id = public.get_my_collaborator_id() AND v.estado = 'aprovada' THEN RAISE EXCEPTION 'own_approved'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF _kind = 'dates' AND (_start IS NULL OR _end IS NULL OR _end < _start) THEN RAISE EXCEPTION 'invalid_dates'; END IF;
  IF _kind = 'dates' AND public.leave_overlaps(v.collaborator_id, v.id, _start, _end) THEN RAISE EXCEPTION 'overlap'; END IF;
  PERFORM public.leave_apply_change(v.id, _kind, _start, _end, _periodo, _horas, _tipo, _dias);
  SELECT * INTO v2 FROM public.vacation_requests WHERE id = v.id;
  INSERT INTO public.vacation_request_history(request_id, actor_id, action, before, after, reason)
  VALUES (v.id, auth.uid(), CASE WHEN _kind = 'cancel' THEN 'cancelled_by_approver' ELSE 'edited_by_approver' END, to_jsonb(v), to_jsonb(v2), trim(_reason));
  PERFORM public.leave_notify(public.leave_request_owner_user(v.collaborator_id), 'leave_changed_by_approver',
    CASE WHEN _kind = 'cancel' THEN 'A sua ausência foi cancelada' ELSE 'A sua ausência foi alterada' END,
    v.data_inicio || ' → ' || v.data_fim || E'\n' || trim(_reason), v.id);
END $$;

REVOKE EXECUTE ON FUNCTION public.leave_change_submit(uuid,text,date,date,text,numeric,public.absence_type,numeric,text,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.leave_change_decide(uuid,boolean,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.leave_direct_change(uuid,text,date,date,text,numeric,public.absence_type,numeric,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_leave_approvers() FROM anon;