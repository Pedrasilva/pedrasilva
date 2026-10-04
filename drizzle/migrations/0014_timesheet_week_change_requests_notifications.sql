ALTER TABLE public.pm_timesheet_weeks
  ADD COLUMN IF NOT EXISTS change_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS change_requested_by uuid,
  ADD COLUMN IF NOT EXISTS change_request_reason text,
  ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false;

-- Who approves a person's week: team approvers covering them, else
-- "All"-scope approvers, else admins. The person is never in the list.
CREATE OR REPLACE FUNCTION public.pm_week_approver_ids(_target_user_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE cand uuid[];
BEGIN
  SELECT array_agg(DISTINCT x) INTO cand FROM (
    SELECT ra.user_id x FROM public.user_role_assignments ra
    UNION SELECT up.user_id FROM public.user_permissions up WHERE up.permission_key = 'timesheets.approve'
    UNION SELECT r.user_id FROM public.user_roles r WHERE r.role = 'admin'
  ) s WHERE x IS NOT NULL AND x <> _target_user_id;

  RETURN QUERY
    SELECT c FROM unnest(cand) c
     WHERE NOT public.has_role(c, 'admin')
       AND EXISTS (SELECT 1 FROM public.list_user_effective_permissions(c) e
                    WHERE e.permission_key = 'timesheets.approve' AND e.scope IN ('team','department'))
       AND NOT EXISTS (SELECT 1 FROM public.list_user_effective_permissions(c) e
                    WHERE e.permission_key = 'timesheets.approve' AND e.scope = 'all')
       AND EXISTS (SELECT 1 FROM public.pm_team_user_ids(c) t WHERE t.user_id = _target_user_id);
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
    SELECT c FROM unnest(cand) c
     WHERE NOT public.has_role(c, 'admin')
       AND EXISTS (SELECT 1 FROM public.list_user_effective_permissions(c) e
                    WHERE e.permission_key = 'timesheets.approve' AND e.scope = 'all');
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY SELECT c FROM unnest(cand) c WHERE public.has_role(c, 'admin');
END $$;

REVOKE ALL ON FUNCTION public.pm_week_approver_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_week_approver_ids(uuid) TO authenticated, service_role;

-- True when the caller may approve their own week (nobody else would).
CREATE OR REPLACE FUNCTION public.pm_week_can_self_approve(_target_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() = _target_user_id
     AND public.pm_can_approve_hours(auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.pm_week_approver_ids(_target_user_id));
$$;
REVOKE ALL ON FUNCTION public.pm_week_can_self_approve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_week_can_self_approve(uuid) TO authenticated, service_role;

-- Change-request bookkeeping, self-approval flag and guard.
CREATE OR REPLACE FUNCTION public.pm_timesheet_week_meta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.change_requested_at IS DISTINCT FROM OLD.change_requested_at
     AND NEW.change_requested_at IS NOT NULL THEN
    IF OLD.status NOT IN ('submitted','approved') OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'A change can only be requested on a submitted or approved week';
    END IF;
    IF auth.uid() IS NOT NULL AND auth.uid() <> NEW.user_id THEN
      RAISE EXCEPTION 'Only the owner can request a change to this week';
    END IF;
    IF coalesce(btrim(NEW.change_request_reason), '') = '' THEN
      RAISE EXCEPTION 'A reason is required';
    END IF;
    NEW.change_requested_by := coalesce(auth.uid(), NEW.user_id);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Any approver action resolves the pending request.
    NEW.change_requested_at := NULL;
    NEW.change_requested_by := NULL;
    NEW.change_request_reason := NULL;
  END IF;

  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.user_id THEN
      IF EXISTS (SELECT 1 FROM public.pm_week_approver_ids(NEW.user_id)) THEN
        RAISE EXCEPTION 'Your week must be approved by your approver';
      END IF;
      NEW.self_approved := true;
    ELSE
      NEW.self_approved := false;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_timesheet_week_meta_trg ON public.pm_timesheet_weeks;
CREATE TRIGGER pm_timesheet_week_meta_trg
  BEFORE INSERT OR UPDATE ON public.pm_timesheet_weeks
  FOR EACH ROW EXECUTE FUNCTION public.pm_timesheet_week_meta();

-- Bell notifications for the week workflow.
CREATE OR REPLACE FUNCTION public.pm_week_workflow_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  person text;
  wk text := to_char(NEW.week_start, 'DD/MM/YYYY');
  approve_link text := '/projects/weekly-approval?week=' || NEW.week_start || '&user=' || NEW.user_id;
  own_link text := '/projects/timesheet?week=' || NEW.week_start;
  actor uuid := auth.uid();
  bank text := '';
BEGIN
  SELECT c.nome INTO person FROM public.collaborators c
    JOIN auth.users u ON lower(u.email) = lower(c.email)
   WHERE u.id = NEW.user_id LIMIT 1;
  person := coalesce(person, 'Colaborador');

  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submitted') THEN
    PERFORM public.notify_user(a.user_id, 'timesheet_week_submitted',
      'Semana submetida: ' || person, 'Semana de ' || wk || ' aguarda aprovação',
      approve_link, 'projects', 'pm_timesheet_week', NEW.id,
      'tsw:sub:' || NEW.id || ':' || coalesce(NEW.submitted_at::text, now()::text))
    FROM public.pm_week_approver_ids(NEW.user_id) a;
  ELSIF TG_OP = 'UPDATE' AND NEW.change_requested_at IS NOT NULL
        AND NEW.change_requested_at IS DISTINCT FROM OLD.change_requested_at THEN
    PERFORM public.notify_user(a.user_id, 'timesheet_week_change_requested',
      'Alteração pedida: ' || person || ' (' || wk || ')', NEW.change_request_reason,
      approve_link, 'projects', 'pm_timesheet_week', NEW.id,
      'tsw:chg:' || NEW.id || ':' || NEW.change_requested_at::text)
    FROM public.pm_week_approver_ids(NEW.user_id) a;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
        AND NOT NEW.self_approved THEN
    IF NEW.additional_hours_approved > 0 THEN
      bank := ' · +' || trim(to_char(NEW.additional_hours_approved, 'FM990.00')) || 'h no banco de horas';
    ELSIF NEW.shortfall_hours_approved > 0 THEN
      bank := ' · −' || trim(to_char(NEW.shortfall_hours_approved, 'FM990.00')) || 'h no banco de horas';
    END IF;
    PERFORM public.notify_user(NEW.user_id, 'timesheet_week_approved',
      'Semana aprovada (' || wk || ')',
      'A tua semana foi aprovada' || bank || coalesce(' — ' || nullif(NEW.reviewer_comment, ''), ''),
      own_link, 'projects', 'pm_timesheet_week', NEW.id,
      'tsw:apr:' || NEW.id || ':' || coalesce(NEW.approved_at::text, now()::text));
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'returned' AND OLD.status IS DISTINCT FROM 'returned'
        AND actor IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.notify_user(NEW.user_id, 'timesheet_week_returned',
      'Semana devolvida para corrigir (' || wk || ')', NEW.reviewer_comment,
      own_link, 'projects', 'pm_timesheet_week', NEW.id,
      'tsw:ret:' || NEW.id || ':' || coalesce(NEW.returned_at::text, now()::text));
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status = 'approved'
        AND actor IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.notify_user(NEW.user_id, 'timesheet_week_reopened',
      'Semana reaberta (' || wk || ')', NEW.reopen_reason,
      own_link, 'projects', 'pm_timesheet_week', NEW.id,
      'tsw:reo:' || NEW.id || ':' || coalesce(NEW.reopened_at::text, now()::text));
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'pm_week_workflow_notify: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pm_week_workflow_notify_trg ON public.pm_timesheet_weeks;
CREATE TRIGGER pm_week_workflow_notify_trg
  AFTER INSERT OR UPDATE ON public.pm_timesheet_weeks
  FOR EACH ROW EXECUTE FUNCTION public.pm_week_workflow_notify();