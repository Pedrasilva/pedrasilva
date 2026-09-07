-- =========================================================
-- Work From Home — full feature build (additive)
-- =========================================================

ALTER TABLE public.remote_work_requests
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'home',
  ADD COLUMN IF NOT EXISTS motivo_rejeicao text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS override_by uuid,
  ADD COLUMN IF NOT EXISTS request_group_id uuid;

ALTER TABLE public.remote_work_requests
  DROP CONSTRAINT IF EXISTS remote_work_requests_estado_check;
ALTER TABLE public.remote_work_requests
  ADD CONSTRAINT remote_work_requests_estado_check
  CHECK (estado = ANY (ARRAY['pendente','aprovada','rejeitada','cancelada']));

ALTER TABLE public.remote_work_requests
  DROP CONSTRAINT IF EXISTS remote_work_requests_location_type_check;
ALTER TABLE public.remote_work_requests
  ADD CONSTRAINT remote_work_requests_location_type_check
  CHECK (location_type = ANY (ARRAY['home','remote']));

CREATE INDEX IF NOT EXISTS remote_work_requests_group_idx
  ON public.remote_work_requests (request_group_id);
CREATE INDEX IF NOT EXISTS remote_work_requests_data_idx
  ON public.remote_work_requests (data);

-- ---------------------------------------------------------
-- Settings (singleton)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.remote_work_settings (
  id boolean PRIMARY KEY DEFAULT true,
  approval_required boolean NOT NULL DEFAULT true,
  minimum_notice_days integer NOT NULL DEFAULT 1,
  allow_same_day_requests boolean NOT NULL DEFAULT false,
  allow_admin_override boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remote_work_settings_singleton CHECK (id)
);

GRANT SELECT ON public.remote_work_settings TO authenticated;
GRANT INSERT, UPDATE ON public.remote_work_settings TO authenticated;
GRANT ALL ON public.remote_work_settings TO service_role;
ALTER TABLE public.remote_work_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone reads WFH settings" ON public.remote_work_settings;
CREATE POLICY "Everyone reads WFH settings"
  ON public.remote_work_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "HR admins write WFH settings" ON public.remote_work_settings;
CREATE POLICY "HR admins write WFH settings"
  ON public.remote_work_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_module_permission(auth.uid(), 'hr.admin', 'all'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_module_permission(auth.uid(), 'hr.admin', 'all'));

DROP TRIGGER IF EXISTS remote_work_settings_touch ON public.remote_work_settings;
CREATE TRIGGER remote_work_settings_touch
  BEFORE UPDATE ON public.remote_work_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.remote_work_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------
-- Approvers
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.remote_work_approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approver_user_id uuid NOT NULL,
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS remote_work_approvers_unique_global
  ON public.remote_work_approvers (approver_user_id)
  WHERE collaborator_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS remote_work_approvers_unique_scoped
  ON public.remote_work_approvers (approver_user_id, collaborator_id)
  WHERE collaborator_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remote_work_approvers TO authenticated;
GRANT ALL ON public.remote_work_approvers TO service_role;
ALTER TABLE public.remote_work_approvers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone reads WFH approvers" ON public.remote_work_approvers;
CREATE POLICY "Everyone reads WFH approvers"
  ON public.remote_work_approvers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "HR admins manage WFH approvers" ON public.remote_work_approvers;
CREATE POLICY "HR admins manage WFH approvers"
  ON public.remote_work_approvers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_module_permission(auth.uid(), 'hr.admin', 'all'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_module_permission(auth.uid(), 'hr.admin', 'all'));

DROP TRIGGER IF EXISTS remote_work_approvers_touch ON public.remote_work_approvers;
CREATE TRIGGER remote_work_approvers_touch
  BEFORE UPDATE ON public.remote_work_approvers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- Approval helper
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remote_work_can_approve(_user uuid, _collaborator uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user IS NOT NULL AND (
    public.has_role(_user, 'admin')
    OR public.has_module_permission(_user, 'hr.admin', 'all')
    OR public.has_module_permission(_user, 'hr.leave.approve', 'all')
    OR EXISTS (
      SELECT 1 FROM public.remote_work_approvers a
      WHERE a.active
        AND a.approver_user_id = _user
        AND (a.collaborator_id IS NULL OR a.collaborator_id = _collaborator)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.remote_work_can_approve(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remote_work_can_approve(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------
-- RLS on requests
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "Approved visible to all; own + approvers see all" ON public.remote_work_requests;
CREATE POLICY "Approved visible to all; own + approvers see all"
  ON public.remote_work_requests FOR SELECT TO authenticated
  USING (
    estado = 'aprovada'
    OR collaborator_id = public.get_my_collaborator_id()
    OR public.remote_work_can_approve(auth.uid(), collaborator_id)
  );

DROP POLICY IF EXISTS "Admins update; users update own pending" ON public.remote_work_requests;
CREATE POLICY "Approvers decide; users cancel own"
  ON public.remote_work_requests FOR UPDATE TO authenticated
  USING (
    public.remote_work_can_approve(auth.uid(), collaborator_id)
    OR (collaborator_id = public.get_my_collaborator_id() AND estado IN ('pendente','aprovada'))
  )
  WITH CHECK (
    public.remote_work_can_approve(auth.uid(), collaborator_id)
    OR (collaborator_id = public.get_my_collaborator_id() AND estado IN ('pendente','cancelada'))
  );

DROP POLICY IF EXISTS "Admins delete; users delete own pending" ON public.remote_work_requests;
CREATE POLICY "Admins delete remote requests"
  ON public.remote_work_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------
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

DROP TRIGGER IF EXISTS remote_work_notify_trg ON public.remote_work_requests;
CREATE TRIGGER remote_work_notify_trg
  AFTER INSERT OR UPDATE ON public.remote_work_requests
  FOR EACH ROW EXECUTE FUNCTION public.remote_work_notify();

-- ---------------------------------------------------------
-- v2 permission keys
-- ---------------------------------------------------------
INSERT INTO public.role_permissions (role, permission_key, scope)
SELECT r.role, k.key, 'own'
FROM (VALUES ('admin'::pm_role), ('architect'::pm_role)) AS r(role),
     (VALUES ('hr.wfh.request')) AS k(key)
ON CONFLICT DO NOTHING;
