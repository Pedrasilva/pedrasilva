CREATE OR REPLACE FUNCTION public.leave_decide_pending(_req uuid, _approve boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v public.vacation_requests; v2 public.vacation_requests; r text := nullif(trim(coalesce(_reason,'')),'');
BEGIN
  IF NOT public.can_approve_leave(auth.uid()) THEN RAISE EXCEPTION 'not_approver'; END IF;
  SELECT * INTO v FROM public.vacation_requests WHERE id = _req FOR UPDATE;
  IF v.id IS NULL OR v.estado <> 'pendente' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF v.collaborator_id = public.get_my_collaborator_id()
     OR public.leave_request_owner_user(v.collaborator_id) = auth.uid() THEN RAISE EXCEPTION 'own_request'; END IF;
  IF NOT _approve AND r IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF _approve AND public.leave_overlaps(v.collaborator_id, v.id, v.data_inicio, v.data_fim) THEN RAISE EXCEPTION 'overlap'; END IF;
  PERFORM set_config('psa.leave_decide', 'on', true);
  UPDATE public.vacation_requests SET estado = CASE WHEN _approve THEN 'aprovada' ELSE 'rejeitada' END,
    aprovado_por = auth.uid(), aprovado_em = now() WHERE id = v.id RETURNING * INTO v2;
  PERFORM set_config('psa.leave_decide', 'off', true);
  INSERT INTO public.vacation_request_history(request_id, actor_id, action, before, after, reason)
  VALUES (v.id, auth.uid(), CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, to_jsonb(v), to_jsonb(v2), r);
  PERFORM public.leave_notify(public.leave_request_owner_user(v.collaborator_id),
    CASE WHEN _approve THEN 'leave_request_approved' ELSE 'leave_request_rejected' END,
    CASE WHEN _approve THEN 'O seu pedido de ausência foi aprovado' ELSE 'O seu pedido de ausência foi rejeitado' END,
    v.data_inicio || ' → ' || v.data_fim || coalesce(E'\n' || r, ''), v.id);
END $fn$;
REVOKE ALL ON FUNCTION public.leave_decide_pending(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_decide_pending(uuid, boolean, text) TO authenticated;

-- Pending → approved/rejected only through leave_decide_pending; new rows from users start pending.
CREATE OR REPLACE FUNCTION public.vacation_request_decision_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  IF auth.uid() IS NULL OR coalesce(current_setting('psa.leave_decide', true), '') = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado IS DISTINCT FROM 'pendente' THEN RAISE EXCEPTION 'use_leave_decide'; END IF;
  ELSIF OLD.estado = 'pendente' AND NEW.estado IN ('aprovada','rejeitada') THEN
    RAISE EXCEPTION 'use_leave_decide';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS vacation_request_decision_guard_trg ON public.vacation_requests;
CREATE TRIGGER vacation_request_decision_guard_trg BEFORE INSERT OR UPDATE OF estado ON public.vacation_requests
FOR EACH ROW EXECUTE FUNCTION public.vacation_request_decision_guard();