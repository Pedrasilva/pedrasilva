CREATE OR REPLACE FUNCTION public.leave_label_for(_tipo text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _tipo
    WHEN 'ferias' THEN 'Vacation'
    WHEN 'casamento' THEN 'Wedding leave'
    WHEN 'falecimento_familiar' THEN 'Bereavement'
    WHEN 'assistencia_filho' THEN 'Child assistance'
    WHEN 'nascimento_filho' THEN 'Parental leave'
    WHEN 'trabalhador_estudante' THEN 'Student worker'
    WHEN 'doacao_sangue' THEN 'Blood donation'
    WHEN 'autorizada_paga' THEN 'Authorized (paid)'
    WHEN 'autorizada_nao_paga' THEN 'Authorized (unpaid)'
    ELSE _tipo END
$$;

-- Keeps automatic non_working timesheet entries in step with leave requests.
-- Removes entries of the old approved range that are no longer covered by an
-- approved request of the same type; creates entries for the new approved range.
-- Entries inside submitted/approved timesheet weeks are left untouched (they
-- then show in the grid as "Sem pedido aprovado").
CREATE OR REPLACE FUNCTION public.vacation_request_sync_timesheet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
  v_daily numeric;
  v_hours numeric;
  v_label text;
  d date;
BEGIN
  -- Remove old range
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.estado IN ('aprovada','aprovado') THEN
    SELECT u.id INTO v_user FROM public.collaborators c JOIN auth.users u ON lower(u.email) = lower(c.email)
      WHERE c.id = OLD.collaborator_id LIMIT 1;
    IF v_user IS NOT NULL THEN
      v_label := public.leave_label_for(OLD.tipo::text);
      DELETE FROM public.pm_time_entries e
      WHERE e.user_id = v_user
        AND e.entry_type = 'non_working'
        AND e.leave_type = v_label
        AND e.entry_date BETWEEN OLD.data_inicio AND OLD.data_fim
        AND COALESCE(e.source,'') IN ('timesheet','auto-nonworking')
        AND NOT EXISTS (
          SELECT 1 FROM public.vacation_requests v
          WHERE v.collaborator_id = OLD.collaborator_id
            AND v.id <> OLD.id
            AND v.estado IN ('aprovada','aprovado')
            AND public.leave_label_for(v.tipo::text) = v_label
            AND e.entry_date BETWEEN v.data_inicio AND v.data_fim)
        AND NOT EXISTS (
          SELECT 1 FROM public.pm_timesheet_weeks w
          WHERE w.user_id = v_user AND e.entry_date BETWEEN w.week_start AND w.week_end
            AND w.status IN ('submitted','approved'));
    END IF;
  END IF;

  -- Create new range
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.estado IN ('aprovada','aprovado') THEN
    SELECT u.id, COALESCE(c.daily_hours, 8) INTO v_user, v_daily
      FROM public.collaborators c JOIN auth.users u ON lower(u.email) = lower(c.email)
      WHERE c.id = NEW.collaborator_id LIMIT 1;
    IF v_user IS NOT NULL THEN
      v_label := public.leave_label_for(NEW.tipo::text);
      v_hours := CASE
        WHEN NEW.periodo = 'horas' THEN LEAST(COALESCE(NEW.horas,0), v_daily)
        WHEN NEW.periodo IN ('manha','tarde','meio_dia') THEN v_daily / 2
        ELSE v_daily END;
      IF v_hours > 0 THEN
        FOR d IN SELECT g::date FROM generate_series(NEW.data_inicio, NEW.data_fim, interval '1 day') g LOOP
          CONTINUE WHEN extract(isodow FROM d) IN (6,7);
          CONTINUE WHEN EXISTS (SELECT 1 FROM public.holidays h WHERE h.data = d);
          CONTINUE WHEN EXISTS (SELECT 1 FROM public.pm_time_entries e
            WHERE e.user_id = v_user AND e.entry_type = 'non_working' AND e.leave_type = v_label AND e.entry_date = d);
          CONTINUE WHEN EXISTS (SELECT 1 FROM public.pm_timesheet_weeks w
            WHERE w.user_id = v_user AND d BETWEEN w.week_start AND w.week_end AND w.status IN ('submitted','approved'));
          INSERT INTO public.pm_time_entries (user_id, entry_date, hours, entry_type, leave_type, billable, source)
          VALUES (v_user, d, v_hours, 'non_working', v_label, false, 'auto-nonworking');
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS vacation_request_sync_timesheet_trg ON public.vacation_requests;
CREATE TRIGGER vacation_request_sync_timesheet_trg
AFTER INSERT OR DELETE OR UPDATE OF estado, data_inicio, data_fim, tipo, periodo, horas
ON public.vacation_requests
FOR EACH ROW EXECUTE FUNCTION public.vacation_request_sync_timesheet();