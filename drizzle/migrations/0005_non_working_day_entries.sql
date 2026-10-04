ALTER TABLE public.pm_time_entries ADD COLUMN IF NOT EXISTS non_working_day_reason text;
ALTER TABLE public.pm_time_entries DROP CONSTRAINT IF EXISTS pm_time_entries_nwd_reason_check;
ALTER TABLE public.pm_time_entries ADD CONSTRAINT pm_time_entries_nwd_reason_check CHECK (non_working_day_reason IS NULL OR non_working_day_reason IN ('holiday','weekend','leave'));
CREATE INDEX IF NOT EXISTS pm_time_entries_nwd_idx ON public.pm_time_entries (user_id, entry_date) WHERE non_working_day_reason IS NOT NULL;

-- Reason a day is not a working day for this person; null for ordinary days.
CREATE OR REPLACE FUNCTION public.pm_non_working_day_reason(_user_id uuid, _date date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.holidays h WHERE h.data = _date) THEN 'holiday'
    WHEN EXISTS (
      SELECT 1 FROM public.vacation_requests v
      JOIN public.collaborators c ON c.id = v.collaborator_id
      JOIN auth.users u ON lower(u.email) = lower(c.email)
      WHERE u.id = _user_id AND v.estado = 'aprovada' AND v.periodo = 'dia_inteiro'
        AND _date BETWEEN v.data_inicio AND v.data_fim
    ) THEN 'leave'
    WHEN extract(isodow FROM _date) IN (6, 7) THEN 'weekend'
    ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.pm_non_working_day_reason(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pm_non_working_day_reason(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pm_time_entry_nwd_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.entry_type IS NOT DISTINCT FROM OLD.entry_type THEN
    NEW.non_working_day_reason := OLD.non_working_day_reason; -- clients cannot set it
    RETURN NEW;
  END IF;
  IF NEW.entry_type = 'non_working' THEN
    NEW.non_working_day_reason := NULL;
  ELSE
    NEW.non_working_day_reason := public.pm_non_working_day_reason(NEW.user_id, NEW.entry_date);
  END IF;
  -- An approved entry moved onto a non-working day needs approval again.
  IF TG_OP = 'UPDATE' AND NEW.non_working_day_reason IS NOT NULL
     AND OLD.non_working_day_reason IS NULL AND NEW.approval_status = 'approved' THEN
    NEW.approval_status := 'pending'; NEW.approved_at := NULL; NEW.approved_by := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_time_entry_nwd ON public.pm_time_entries;
CREATE TRIGGER pm_time_entry_nwd BEFORE INSERT OR UPDATE ON public.pm_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.pm_time_entry_nwd_trg();

-- Backfill existing rows (additive).
UPDATE public.pm_time_entries e SET non_working_day_reason = public.pm_non_working_day_reason(e.user_id, e.entry_date)
WHERE e.entry_type <> 'non_working' AND public.pm_non_working_day_reason(e.user_id, e.entry_date) IS NOT NULL;

-- Notify approvers (admins, who see the approval queue) when a week with such entries is submitted.
CREATE OR REPLACE FUNCTION public.pm_week_nwd_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; who text; a uuid;
BEGIN
  IF NEW.status <> 'submitted' OR (TG_OP = 'UPDATE' AND OLD.status = 'submitted') THEN RETURN NEW; END IF;
  SELECT count(*) INTO n FROM public.pm_time_entries
   WHERE user_id = NEW.user_id AND entry_date BETWEEN NEW.week_start AND NEW.week_end
     AND non_working_day_reason IS NOT NULL AND approval_status = 'pending' AND hours > 0;
  IF n = 0 THEN RETURN NEW; END IF;
  SELECT coalesce(c.nome, u.email) INTO who FROM auth.users u
    LEFT JOIN public.collaborators c ON lower(c.email) = lower(u.email) WHERE u.id = NEW.user_id;
  FOR a IN SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, link_path, module, entity_type, entity_id, dedupe_key)
    VALUES (a, 'timesheet_non_working_day',
      'Trabalho em dia não útil · Work on a non-working day',
      coalesce(who, '?') || ': ' || n || ' entrada(s) em dia não útil aguardam aprovação (semana de ' || to_char(NEW.week_start, 'DD/MM') || ').',
      '/projects/approvals', 'projects', 'pm_timesheet_week', NEW.id,
      'nwd:' || NEW.id || ':' || coalesce(NEW.submitted_at::text, now()::text))
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pm_week_nwd_notify_trg ON public.pm_timesheet_weeks;
CREATE TRIGGER pm_week_nwd_notify_trg AFTER INSERT OR UPDATE OF status ON public.pm_timesheet_weeks
  FOR EACH ROW EXECUTE FUNCTION public.pm_week_nwd_notify();