ALTER TABLE public.remote_work_requests
  ADD COLUMN IF NOT EXISTS day_part text NOT NULL DEFAULT 'full_day',
  ADD COLUMN IF NOT EXISTS workflow_mode text NOT NULL DEFAULT 'approval_required',
  ADD COLUMN IF NOT EXISTS work_kind text NOT NULL DEFAULT 'home_office',
  ADD COLUMN IF NOT EXISTS location_detail text;

ALTER TABLE public.remote_work_requests
  DROP CONSTRAINT IF EXISTS remote_work_requests_day_part_check,
  DROP CONSTRAINT IF EXISTS remote_work_requests_workflow_mode_check,
  DROP CONSTRAINT IF EXISTS remote_work_requests_work_kind_check,
  DROP CONSTRAINT IF EXISTS remote_work_requests_estado_check;

ALTER TABLE public.remote_work_requests
  ADD CONSTRAINT remote_work_requests_day_part_check
    CHECK (day_part = ANY (ARRAY['full_day','morning','afternoon'])),
  ADD CONSTRAINT remote_work_requests_workflow_mode_check
    CHECK (workflow_mode = ANY (ARRAY['approval_required','notification_only'])),
  ADD CONSTRAINT remote_work_requests_work_kind_check
    CHECK (work_kind = ANY (ARRAY['home_office','remote_elsewhere','client_site','external_meeting','other'])),
  ADD CONSTRAINT remote_work_requests_estado_check
    CHECK (estado = ANY (ARRAY['pendente','aprovada','rejeitada','cancelada','declarada']));

COMMENT ON COLUMN public.remote_work_requests.day_part IS 'Remote work is a location, not an absence. Half days never reduce contractual capacity.';
COMMENT ON COLUMN public.remote_work_requests.workflow_mode IS 'approval_required rows enter the approval queue (estado pendente); notification_only rows are created as estado declarada.';

ALTER TABLE public.remote_work_settings
  ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'approval_required';

ALTER TABLE public.remote_work_settings
  DROP CONSTRAINT IF EXISTS remote_work_settings_approval_mode_check;

ALTER TABLE public.remote_work_settings
  ADD CONSTRAINT remote_work_settings_approval_mode_check
    CHECK (approval_mode = ANY (ARRAY['approval_required','notification_only']));

CREATE OR REPLACE FUNCTION public.remote_work_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _employee_user uuid;
  _employee_name text;
  _approver uuid;
BEGIN
  SELECT c.nome INTO _employee_name FROM public.collaborators c WHERE c.id = NEW.collaborator_id;
  _employee_user := public.get_user_id_for_collaborator(NEW.collaborator_id);

  IF TG_OP = 'INSERT' THEN
    -- Declared (notification-only) rows never enter the approval queue.
    IF NEW.estado <> 'pendente' THEN
      RETURN NEW;
    END IF;
    FOR _approver IN
      SELECT DISTINCT a.approver_user_id
      FROM public.remote_work_approvers a
      WHERE a.active
        AND (a.collaborator_id = NEW.collaborator_id OR a.collaborator_id IS NULL)
    LOOP
      PERFORM public.notify_user(
        _approver, 'wfh_request',
        coalesce(_employee_name, 'Colaborador') || ' — pedido de trabalho remoto',
        to_char(NEW.data, 'DD/MM/YYYY'),
        '/hr/trabalho-remoto', 'hr', 'remote_work_request', NEW.id, NULL,
        'wfh_new_' || NEW.id::text || '_' || _approver::text
      );
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado IN ('aprovada','rejeitada') THEN
      PERFORM public.notify_user(
        _employee_user, 'wfh_decision',
        CASE WHEN NEW.estado = 'aprovada'
          THEN 'Trabalho remoto aprovado' ELSE 'Trabalho remoto rejeitado' END,
        to_char(NEW.data, 'DD/MM/YYYY') ||
          coalesce(' — ' || NEW.motivo_rejeicao, ''),
        '/hr/trabalho-remoto', 'hr', 'remote_work_request', NEW.id, NULL,
        'wfh_' || NEW.estado || '_' || NEW.id::text
      );
    ELSIF NEW.estado = 'cancelada' THEN
      FOR _approver IN
        SELECT DISTINCT a.approver_user_id
        FROM public.remote_work_approvers a
        WHERE a.active
          AND (a.collaborator_id = NEW.collaborator_id OR a.collaborator_id IS NULL)
      LOOP
        PERFORM public.notify_user(
          _approver, 'wfh_cancelled',
          coalesce(_employee_name, 'Colaborador') || ' — trabalho remoto cancelado',
          to_char(NEW.data, 'DD/MM/YYYY'),
          '/hr/trabalho-remoto', 'hr', 'remote_work_request', NEW.id, NULL,
          'wfh_cancel_' || NEW.id::text || '_' || _approver::text
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;