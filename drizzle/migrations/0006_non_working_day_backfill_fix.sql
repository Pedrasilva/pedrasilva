CREATE OR REPLACE FUNCTION public.pm_time_entry_nwd_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.entry_type IS NOT DISTINCT FROM OLD.entry_type
     AND coalesce(current_setting('pm.nwd_recompute', true), '') <> 'on' THEN
    NEW.non_working_day_reason := OLD.non_working_day_reason; -- clients cannot set it
    RETURN NEW;
  END IF;
  IF NEW.entry_type = 'non_working' THEN
    NEW.non_working_day_reason := NULL;
  ELSE
    NEW.non_working_day_reason := public.pm_non_working_day_reason(NEW.user_id, NEW.entry_date);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.non_working_day_reason IS NOT NULL
     AND OLD.non_working_day_reason IS NULL AND NEW.approval_status = 'approved'
     AND coalesce(current_setting('pm.nwd_recompute', true), '') <> 'on' THEN
    NEW.approval_status := 'pending'; NEW.approved_at := NULL; NEW.approved_by := NULL;
  END IF;
  RETURN NEW;
END $$;