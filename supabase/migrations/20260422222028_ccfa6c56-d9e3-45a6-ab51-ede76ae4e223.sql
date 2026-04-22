
DO $$ BEGIN
  CREATE TYPE public.pm_role AS ENUM (
    'admin', 'partner', 'project_lead', 'architect', 'hr', 'finance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  user_id uuid PRIMARY KEY,
  role public.pm_role NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  notes text
);

ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read role assignments" ON public.user_role_assignments;
CREATE POLICY "Authenticated read role assignments"
  ON public.user_role_assignments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage role assignments" ON public.user_role_assignments;
CREATE POLICY "Admins manage role assignments"
  ON public.user_role_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS granted boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_user_id_permission_key_key;
ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_user_id_permission_key_scope_key;
ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_user_id_permission_key_scope_key
  UNIQUE (user_id, permission_key, scope);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.pm_role NOT NULL,
  permission_key text NOT NULL,
  scope text NOT NULL DEFAULT 'all',
  PRIMARY KEY (role, permission_key, scope)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read role permissions" ON public.role_permissions;
CREATE POLICY "Authenticated read role permissions"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage role permissions" ON public.role_permissions;
CREATE POLICY "Admins manage role permissions"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.role_permissions (role, permission_key, scope) VALUES
  ('admin', 'projects.view',                'all'),
  ('admin', 'projects.edit_planning',       'all'),
  ('admin', 'projects.edit_stages',         'all'),
  ('admin', 'projects.view_financials',     'all'),
  ('admin', 'projects.view_margins',        'all'),
  ('admin', 'scheduling.view',              'all'),
  ('admin', 'scheduling.view_team',         'all'),
  ('admin', 'scheduling.edit',              'all'),
  ('admin', 'timesheets.log',               'own'),
  ('admin', 'timesheets.view_team',         'all'),
  ('admin', 'timesheets.approve',           'all'),
  ('admin', 'financials.view',              'all'),
  ('admin', 'financials.view_rates',        'all'),
  ('partner', 'projects.view',              'all'),
  ('partner', 'projects.view_financials',   'all'),
  ('partner', 'projects.view_margins',      'all'),
  ('partner', 'scheduling.view',            'all'),
  ('partner', 'scheduling.view_team',       'all'),
  ('partner', 'timesheets.view_team',       'all'),
  ('partner', 'timesheets.approve',         'all'),
  ('partner', 'financials.view',            'all'),
  ('partner', 'financials.view_rates',      'all'),
  ('project_lead', 'projects.view',         'all'),
  ('project_lead', 'projects.edit_planning','assigned'),
  ('project_lead', 'projects.edit_stages',  'assigned'),
  ('project_lead', 'projects.view_financials','assigned'),
  ('project_lead', 'projects.view_margins', 'assigned'),
  ('project_lead', 'scheduling.view',       'all'),
  ('project_lead', 'scheduling.view_team',  'team'),
  ('project_lead', 'scheduling.edit',       'team'),
  ('project_lead', 'timesheets.log',        'own'),
  ('project_lead', 'timesheets.view_team',  'team'),
  ('project_lead', 'timesheets.approve',    'team'),
  ('architect', 'projects.view',            'assigned'),
  ('architect', 'scheduling.view',          'own'),
  ('architect', 'timesheets.log',           'own'),
  ('hr', 'projects.view',                   'all'),
  ('hr', 'scheduling.view',                 'all'),
  ('hr', 'scheduling.view_team',            'all'),
  ('hr', 'timesheets.view_team',            'all'),
  ('finance', 'projects.view',              'all'),
  ('finance', 'projects.view_financials',   'all'),
  ('finance', 'projects.view_margins',      'all'),
  ('finance', 'financials.view',            'all'),
  ('finance', 'financials.view_rates',      'all'),
  ('finance', 'timesheets.view_team',       'all')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.list_user_effective_permissions(_user_id uuid)
RETURNS TABLE(permission_key text, scope text, source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH user_role AS (
    SELECT role FROM public.user_role_assignments WHERE user_id = _user_id
  ),
  baseline AS (
    SELECT rp.permission_key, rp.scope, 'role'::text AS source
    FROM public.role_permissions rp
    JOIN user_role ur ON ur.role = rp.role
  ),
  grants AS (
    SELECT permission_key, scope, 'override'::text AS source
    FROM public.user_permissions
    WHERE user_id = _user_id AND granted = true
  ),
  revokes AS (
    SELECT permission_key, scope
    FROM public.user_permissions
    WHERE user_id = _user_id AND granted = false
  ),
  combined AS (
    SELECT permission_key, scope, source FROM baseline
    UNION
    SELECT permission_key, scope, source FROM grants
  )
  SELECT c.permission_key, c.scope, c.source
  FROM combined c
  WHERE NOT EXISTS (
    SELECT 1 FROM revokes r
    WHERE r.permission_key = c.permission_key AND r.scope = c.scope
  );
$$;

GRANT EXECUTE ON FUNCTION public.list_user_effective_permissions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_module_permission(
  _user_id uuid, _key text, _required_scope text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH ranks(scope, rank) AS (
    VALUES ('own',1),('assigned',2),('team',3),('department',4),('all',5)
  ),
  required AS (SELECT rank FROM ranks WHERE scope = _required_scope),
  effective AS (
    SELECT scope FROM public.list_user_effective_permissions(_user_id)
    WHERE permission_key = _key
  )
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM effective e
      JOIN ranks r ON r.scope = e.scope
      WHERE r.rank >= (SELECT rank FROM required)
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_module_permission(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.suggest_role_for_user(_user_id uuid)
RETURNS public.pm_role
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  has_fin boolean;
  has_all boolean;
  has_resources boolean;
  has_hr_admin boolean;
BEGIN
  IF public.has_role(_user_id, 'admin') THEN
    RETURN 'admin'::public.pm_role;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id AND permission_key = 'projects.financials' AND granted = true)
  INTO has_fin;
  SELECT EXISTS(SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id AND permission_key = 'projects.all' AND granted = true)
  INTO has_all;
  SELECT EXISTS(SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id AND permission_key = 'projects.resources' AND granted = true)
  INTO has_resources;
  SELECT EXISTS(SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id
      AND permission_key IN ('hr.colaboradores','hr.subsidio-alimentacao','hr.valor-bo'))
  INTO has_hr_admin;

  IF has_hr_admin THEN RETURN 'hr'::public.pm_role; END IF;
  IF has_fin AND has_all THEN RETURN 'partner'::public.pm_role; END IF;
  IF has_fin THEN RETURN 'finance'::public.pm_role; END IF;
  IF has_resources OR has_all THEN RETURN 'project_lead'::public.pm_role; END IF;
  RETURN 'architect'::public.pm_role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_role_for_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_role(
  _user_id uuid, _role public.pm_role, _apply_preset boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.user_role_assignments (user_id, role, assigned_by)
  VALUES (_user_id, _role, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role, assigned_at = now(), assigned_by = auth.uid();

  IF _apply_preset THEN
    DELETE FROM public.user_permissions
    WHERE user_id = _user_id
      AND (
        permission_key LIKE 'projects.view%'
        OR permission_key LIKE 'projects.edit%'
        OR permission_key LIKE 'scheduling.%'
        OR permission_key LIKE 'timesheets.%'
        OR permission_key LIKE 'financials.%'
      );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.pm_role, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_users_with_role_v2()
RETURNS TABLE(
  user_id uuid, email text, is_admin boolean, is_super_admin boolean,
  collaborator_id uuid, collaborator_nome text,
  assigned_role public.pm_role, suggested_role public.pm_role,
  effective_keys text[], effective_scopes text[], override_keys text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin'),
    public.is_super_admin(u.id),
    c.id, c.nome,
    ura.role,
    public.suggest_role_for_user(u.id),
    COALESCE(
      (SELECT array_agg(ep.permission_key ORDER BY ep.permission_key)
        FROM public.list_user_effective_permissions(u.id) ep),
      ARRAY[]::text[]),
    COALESCE(
      (SELECT array_agg(ep.scope ORDER BY ep.permission_key)
        FROM public.list_user_effective_permissions(u.id) ep),
      ARRAY[]::text[]),
    COALESCE(
      (SELECT array_agg(up.permission_key || ':' || up.scope || ':' ||
        CASE WHEN up.granted THEN 'grant' ELSE 'revoke' END ORDER BY up.permission_key)
        FROM public.user_permissions up WHERE up.user_id = u.id),
      ARRAY[]::text[])
  FROM auth.users u
  LEFT JOIN public.collaborators c ON lower(c.email) = lower(u.email)
  LEFT JOIN public.user_role_assignments ura ON ura.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_users_with_role_v2() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_permission_v2(
  _user_id uuid, _key text, _scope text, _state text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _state = 'clear' THEN
    DELETE FROM public.user_permissions
    WHERE user_id = _user_id AND permission_key = _key AND scope = _scope;
  ELSIF _state = 'grant' THEN
    INSERT INTO public.user_permissions (user_id, permission_key, scope, granted)
    VALUES (_user_id, _key, _scope, true)
    ON CONFLICT (user_id, permission_key, scope)
      DO UPDATE SET granted = true;
  ELSIF _state = 'revoke' THEN
    INSERT INTO public.user_permissions (user_id, permission_key, scope, granted)
    VALUES (_user_id, _key, _scope, false)
    ON CONFLICT (user_id, permission_key, scope)
      DO UPDATE SET granted = false;
  ELSE
    RAISE EXCEPTION 'invalid state: %', _state;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_permission_v2(uuid, text, text, text) TO authenticated;
