ALTER TABLE public.vacation_requests DROP CONSTRAINT chk_baixa_medica_requires_attachment;
ALTER TABLE public.vacation_requests ADD CONSTRAINT chk_baixa_medica_requires_attachment CHECK (tipo <> 'baixa_medica' OR attachment_path IS NOT NULL OR estado IN ('pendente','rejeitada','cancelada'));

CREATE OR REPLACE FUNCTION public.vacation_request_sync_timesheet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_daily numeric; v_hours numeric; v_label text; d date; v_actor uuid;
BEGIN
  v_actor := nullif(current_setting('psa.leave_preserve_timesheets_actor',true),'')::uuid;
  IF v_actor IS NOT NULL AND public.has_role(v_actor,'admin') THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.estado IN ('aprovada','aprovado') THEN
    SELECT u.id INTO v_user FROM public.collaborators c JOIN auth.users u ON lower(u.email)=lower(c.email) WHERE c.id=OLD.collaborator_id LIMIT 1;
    IF v_user IS NOT NULL THEN
      v_label:=public.leave_label_for(OLD.tipo::text);
      DELETE FROM public.pm_time_entries e WHERE e.user_id=v_user AND e.entry_type='non_working' AND e.leave_type=v_label AND e.entry_date BETWEEN OLD.data_inicio AND OLD.data_fim AND COALESCE(e.source,'') IN ('timesheet','auto-nonworking')
      AND NOT EXISTS (SELECT 1 FROM public.vacation_requests v WHERE v.collaborator_id=OLD.collaborator_id AND v.id<>OLD.id AND v.estado IN ('aprovada','aprovado') AND public.leave_label_for(v.tipo::text)=v_label AND e.entry_date BETWEEN v.data_inicio AND v.data_fim)
      AND NOT EXISTS (SELECT 1 FROM public.pm_timesheet_weeks w WHERE w.user_id=v_user AND e.entry_date BETWEEN w.week_start AND w.week_end AND w.status IN ('submitted','approved'));
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.estado IN ('aprovada','aprovado') THEN
    SELECT u.id,COALESCE(c.daily_hours,8) INTO v_user,v_daily FROM public.collaborators c JOIN auth.users u ON lower(u.email)=lower(c.email) WHERE c.id=NEW.collaborator_id LIMIT 1;
    IF v_user IS NOT NULL THEN
      v_label:=public.leave_label_for(NEW.tipo::text);
      v_hours:=CASE WHEN NEW.periodo='horas' THEN LEAST(COALESCE(NEW.horas,0),v_daily) WHEN NEW.periodo IN ('manha','tarde','meio_dia') THEN v_daily/2 ELSE v_daily END;
      IF v_hours>0 THEN
        FOR d IN SELECT g::date FROM generate_series(NEW.data_inicio,NEW.data_fim,interval '1 day') g LOOP
          CONTINUE WHEN extract(isodow FROM d) IN (6,7);
          CONTINUE WHEN EXISTS(SELECT 1 FROM public.holidays h WHERE h.data=d);
          CONTINUE WHEN EXISTS(SELECT 1 FROM public.pm_time_entries e WHERE e.user_id=v_user AND e.entry_type='non_working' AND e.leave_type=v_label AND e.entry_date=d);
          CONTINUE WHEN EXISTS(SELECT 1 FROM public.pm_timesheet_weeks w WHERE w.user_id=v_user AND d BETWEEN w.week_start AND w.week_end AND w.status IN ('submitted','approved'));
          INSERT INTO public.pm_time_entries(user_id,entry_date,hours,entry_type,leave_type,billable,source) VALUES(v_user,d,v_hours,'non_working',v_label,false,'auto-nonworking');
        END LOOP;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

CREATE OR REPLACE FUNCTION public.leave_admin_reconcile_preserving_timesheets(_actor uuid,_reason text,_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb; oldrow public.vacation_requests; newrow public.vacation_requests; report jsonb:='[]'; th text; bh text; n integer; touched uuid[]:='{}';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role='admin') THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF nullif(btrim(_reason),'') IS NULL OR jsonb_typeof(_changes)<>'array' OR jsonb_array_length(_changes)=0 THEN RAISE EXCEPTION 'invalid_batch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('leave_admin_reconciliation',0));
  LOCK TABLE public.pm_time_entries,public.pm_timesheet_weeks,public.pm_hours_bank_entries,public.vacation_requests IN SHARE ROW EXCLUSIVE MODE;
  SELECT md5(coalesce(string_agg(to_jsonb(e)::text,'' ORDER BY id),'')) INTO th FROM public.pm_time_entries e;
  SELECT md5(coalesce(string_agg(to_jsonb(e)::text,'' ORDER BY id),'')) INTO bh FROM public.pm_hours_bank_entries e;
  PERFORM set_config('psa.leave_preserve_timesheets_actor',_actor::text,true);
  PERFORM set_config('psa.leave_decide','on',true);
  FOR j IN SELECT value FROM jsonb_array_elements(_changes) LOOP
    oldrow:=NULL;
    IF j ? 'id' THEN
      SELECT * INTO oldrow FROM public.vacation_requests WHERE id=(j->>'id')::uuid FOR UPDATE;
      IF oldrow.id IS NULL OR to_jsonb(oldrow) IS DISTINCT FROM j->'before' THEN RAISE EXCEPTION 'stale_leave_record'; END IF;
      newrow:=jsonb_populate_record(oldrow,j->'after');
    ELSE
      newrow:=jsonb_populate_record(NULL::public.vacation_requests,j->'after');
      newrow.id:=gen_random_uuid(); newrow.created_at:=now(); newrow.updated_at:=now();
    END IF;
    IF newrow.collaborator_id IS NULL OR newrow.data_inicio IS NULL OR newrow.data_fim<newrow.data_inicio OR newrow.estado NOT IN ('aprovada','pendente','cancelada') THEN RAISE EXCEPTION 'invalid_leave'; END IF;
    IF oldrow.id IS NOT NULL AND newrow.collaborator_id<>oldrow.collaborator_id THEN RAISE EXCEPTION 'cannot_change_person'; END IF;
    touched:=array_append(touched,newrow.id);
    IF EXISTS(SELECT 1 FROM public.pm_timesheet_weeks w JOIN public.collaborators c ON c.id=newrow.collaborator_id JOIN auth.users u ON lower(u.email)=lower(c.email) WHERE w.user_id=u.id AND w.status='approved' AND (w.week_start<=newrow.data_fim AND w.week_end>=newrow.data_inicio OR oldrow.id IS NOT NULL AND w.week_start<=oldrow.data_fim AND w.week_end>=oldrow.data_inicio)) THEN RAISE EXCEPTION 'approved_week_requires_separate_bank_reconciliation'; END IF;
    IF newrow.estado='aprovada' THEN newrow.aprovado_por:=_actor; newrow.aprovado_em:=now(); END IF;
    IF oldrow.id IS NULL THEN
      INSERT INTO public.vacation_requests SELECT (newrow).* RETURNING * INTO newrow;
    ELSE
      UPDATE public.vacation_requests SET data_inicio=newrow.data_inicio,data_fim=newrow.data_fim,tipo=newrow.tipo,periodo=newrow.periodo,horas=newrow.horas,dias_uteis=newrow.dias_uteis,estado=newrow.estado,aprovado_por=newrow.aprovado_por,aprovado_em=newrow.aprovado_em WHERE id=oldrow.id RETURNING * INTO newrow;
    END IF;
    INSERT INTO public.vacation_request_history(request_id,actor_id,action,before,after,reason) VALUES(newrow.id,_actor,'admin_reconciliation',CASE WHEN oldrow.id IS NULL THEN NULL ELSE to_jsonb(oldrow) END,to_jsonb(newrow),_reason);
    report:=report||jsonb_build_object('id',newrow.id,'before',CASE WHEN oldrow.id IS NULL THEN NULL ELSE to_jsonb(oldrow) END,'after',to_jsonb(newrow));
  END LOOP;
  PERFORM set_config('psa.leave_preserve_timesheets_actor','',true);
  PERFORM set_config('psa.leave_decide','off',true);
  IF th IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(e)::text,'' ORDER BY id),'')) FROM public.pm_time_entries e) THEN RAISE EXCEPTION 'timesheets_changed'; END IF;
  IF bh IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(e)::text,'' ORDER BY id),'')) FROM public.pm_hours_bank_entries e) THEN RAISE EXCEPTION 'bank_changed_without_approved_week'; END IF;
  RETURN jsonb_build_object('changes',report,'timesheets_unchanged',true,'hours_bank_unchanged',true,'approved_affected_weeks',0);
END $$;
REVOKE ALL ON FUNCTION public.leave_admin_reconcile_preserving_timesheets(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leave_admin_reconcile_preserving_timesheets(uuid,text,jsonb) TO service_role;
COMMENT ON FUNCTION public.leave_admin_reconcile_preserving_timesheets(uuid,text,jsonb) IS 'Service-only audited admin corrections with explicit verified admin actor, stale-row checks, no timesheet writes. Rejects approved affected weeks rather than silently changing their bank approval decisions.';