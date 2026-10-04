CREATE OR REPLACE FUNCTION public.pm_week_nwd_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NEW.status <> 'submitted' OR (TG_OP = 'UPDATE' AND OLD.status = 'submitted') THEN RETURN NEW; END IF;
  SELECT count(*) INTO n FROM public.pm_time_entries e
   WHERE e.user_id = NEW.user_id AND e.entry_date BETWEEN NEW.week_start AND NEW.week_start + 6
     AND e.non_working_day_reason IS NOT NULL AND e.approval_status = 'pending' AND e.hours > 0;
  IF n = 0 THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, kind, title, body, link_path, module, entity_type, entity_id, dedupe_key)
  SELECT ur.user_id, 'timesheet_non_working_day',
         'Trabalho em dia não útil',
         n || CASE WHEN n = 1 THEN ' entrada em dia não útil aguarda aprovação' ELSE ' entradas em dia não útil aguardam aprovação' END,
         '/projects/approvals', 'projects', 'pm_timesheet_week', NEW.id,
         'nwd:' || NEW.id || ':' || coalesce(NEW.submitted_at::text, now()::text)
    FROM (SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin') ur
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_week_nwd_notify_trg ON public.pm_timesheet_weeks;
CREATE TRIGGER pm_week_nwd_notify_trg AFTER INSERT OR UPDATE OF status ON public.pm_timesheet_weeks
FOR EACH ROW EXECUTE FUNCTION public.pm_week_nwd_notify();