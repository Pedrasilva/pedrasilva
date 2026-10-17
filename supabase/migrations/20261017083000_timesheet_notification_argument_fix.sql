CREATE OR REPLACE FUNCTION public.pm_week_workflow_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      _dedupe_key => 'tsw:sub:' || NEW.id || ':' || coalesce(NEW.submitted_at::text, now()::text))
    FROM public.pm_week_approver_ids(NEW.user_id) a;
  ELSIF TG_OP = 'UPDATE' AND NEW.change_requested_at IS NOT NULL
        AND NEW.change_requested_at IS DISTINCT FROM OLD.change_requested_at THEN
    PERFORM public.notify_user(a.user_id, 'timesheet_week_change_requested',
      'Alteração pedida: ' || person || ' (' || wk || ')', NEW.change_request_reason,
      approve_link, 'projects', 'pm_timesheet_week', NEW.id,
      _dedupe_key => 'tsw:chg:' || NEW.id || ':' || NEW.change_requested_at::text)
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
      _dedupe_key => 'tsw:apr:' || NEW.id || ':' || coalesce(NEW.approved_at::text, now()::text));
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'returned' AND OLD.status IS DISTINCT FROM 'returned'
        AND actor IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.notify_user(NEW.user_id, 'timesheet_week_returned',
      'Semana devolvida para corrigir (' || wk || ')', NEW.reviewer_comment,
      own_link, 'projects', 'pm_timesheet_week', NEW.id,
      _dedupe_key => 'tsw:ret:' || NEW.id || ':' || coalesce(NEW.returned_at::text, now()::text));
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status = 'approved'
        AND actor IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.notify_user(NEW.user_id, 'timesheet_week_reopened',
      'Semana reaberta (' || wk || ')', NEW.reopen_reason,
      own_link, 'projects', 'pm_timesheet_week', NEW.id,
      _dedupe_key => 'tsw:reo:' || NEW.id || ':' || coalesce(NEW.reopened_at::text, now()::text));
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'pm_week_workflow_notify: %', SQLERRM;
  RETURN NEW;
END $function$

