CREATE OR REPLACE FUNCTION public.pm_time_entry_active_stage_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stage uuid; v_old_stage uuid; v_status text; v_name text; v_start date; v_end date; v_parent_kind text;
BEGIN
  v_stage := NEW.pm_stage_id;
  IF v_stage IS NULL AND NEW.task_id IS NOT NULL THEN
    SELECT a.stage_id INTO v_stage FROM pm_tasks t JOIN pm_allocations a ON a.id = t.allocation_id WHERE t.id = NEW.task_id;
  END IF;
  IF v_stage IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old_stage := OLD.pm_stage_id;
    IF v_old_stage IS NULL AND OLD.task_id IS NOT NULL THEN
      SELECT a.stage_id INTO v_old_stage FROM pm_tasks t JOIN pm_allocations a ON a.id = t.allocation_id WHERE t.id = OLD.task_id;
    END IF;
    -- Existing entries keep saving as before; only a move to another stage is checked.
    IF v_old_stage IS NOT DISTINCT FROM v_stage THEN RETURN NEW; END IF;
  END IF;
  SELECT s.status, s.name, s.start_date, s.end_date, p.stage_kind
    INTO v_status, v_name, v_start, v_end, v_parent_kind
    FROM pm_stages s LEFT JOIN pm_stages p ON p.id = s.parent_stage_id WHERE s.id = v_stage;
  IF v_status IS NULL OR v_status = 'active' THEN RETURN NEW; END IF;
  IF v_parent_kind = 'retainer_monthly' AND NEW.entry_date BETWEEN v_start AND v_end THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'A fase «%» não está activa (%) e não aceita novas horas. / Stage "%" is not active (%) and takes no new hours.', v_name, v_status, v_name, v_status
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS pm_time_entry_active_stage_trg ON public.pm_time_entries;
CREATE TRIGGER pm_time_entry_active_stage_trg
BEFORE INSERT OR UPDATE OF task_id, pm_stage_id ON public.pm_time_entries
FOR EACH ROW EXECUTE FUNCTION public.pm_time_entry_active_stage_guard();