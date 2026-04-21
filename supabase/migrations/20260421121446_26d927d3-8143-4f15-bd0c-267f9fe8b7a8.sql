-- 1. Super admin protection: track owner email
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id AND lower(email) = 'luis@pedrasilva.com'
  )
$$;

-- 2. Permission keys table (granular)
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_key)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own permissions"
  ON public.user_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage permissions"
  ON public.user_permissions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 3. has_permission function — admin sees all
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user_id AND permission_key = _key
    )
$$;

-- 4. Default permissions on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_keys text[] := ARRAY[
    'hr.minha-ficha',
    'hr.dias-uteis',
    'hr.beneficios.own',
    'hr.ferias.own',
    'crm.companies',
    'crm.contacts',
    'crm.pipeline',
    'projects.my-tasks',
    'projects.timesheet'
  ];
  k text;
BEGIN
  -- ensure user_roles row
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  -- super admin gets admin automatically
  IF lower(NEW.email) = 'luis@pedrasilva.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  -- default permissions for non-admins
  FOREACH k IN ARRAY default_keys LOOP
    INSERT INTO public.user_permissions (user_id, permission_key)
    VALUES (NEW.id, k)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Backfill default permissions for existing non-admin users
INSERT INTO public.user_permissions (user_id, permission_key)
SELECT u.id, k.key
FROM auth.users u
CROSS JOIN (VALUES
  ('hr.minha-ficha'),
  ('hr.dias-uteis'),
  ('hr.beneficios.own'),
  ('hr.ferias.own'),
  ('crm.companies'),
  ('crm.contacts'),
  ('crm.pipeline'),
  ('projects.my-tasks'),
  ('projects.timesheet')
) AS k(key)
WHERE NOT public.has_role(u.id, 'admin')
ON CONFLICT DO NOTHING;

-- 6. Promote Luis to super-admin (and admin role) if exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
WHERE lower(email) = 'luis@pedrasilva.com'
ON CONFLICT DO NOTHING;

-- 7. Promote Tatiana, Irene, Ricardo if their emails exist
-- (matched via collaborators table by first name)
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'
FROM auth.users u
JOIN public.collaborators c ON lower(c.email) = lower(u.email)
WHERE c.nome ILIKE 'Tatiana%'
   OR c.nome ILIKE 'Irene%'
   OR c.nome ILIKE 'Ricardo%'
ON CONFLICT DO NOTHING;

-- 8. Update set_user_admin to protect super admin
CREATE OR REPLACE FUNCTION public.set_user_admin(_user_id uuid, _is_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _user_id = auth.uid() AND _is_admin = false THEN
    RAISE EXCEPTION 'cannot remove your own admin role';
  END IF;

  IF public.is_super_admin(_user_id) AND _is_admin = false THEN
    RAISE EXCEPTION 'cannot remove super admin';
  END IF;

  IF _is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin';
  END IF;
END;
$$;

-- 9. RPC to set/unset a permission
CREATE OR REPLACE FUNCTION public.set_user_permission(_user_id uuid, _key text, _granted boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _granted THEN
    INSERT INTO public.user_permissions (user_id, permission_key)
    VALUES (_user_id, _key)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_permissions
    WHERE user_id = _user_id AND permission_key = _key;
  END IF;
END;
$$;

-- 10. RPC to fetch all users with their permissions (admin only)
CREATE OR REPLACE FUNCTION public.list_users_with_permissions()
RETURNS TABLE (
  user_id uuid,
  email text,
  is_admin boolean,
  is_super_admin boolean,
  collaborator_id uuid,
  collaborator_nome text,
  permissions text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text,
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') AS is_admin,
    public.is_super_admin(u.id) AS is_super_admin,
    c.id AS collaborator_id,
    c.nome AS collaborator_nome,
    COALESCE(
      (SELECT array_agg(permission_key ORDER BY permission_key)
       FROM public.user_permissions WHERE user_id = u.id),
      ARRAY[]::text[]
    ) AS permissions
  FROM auth.users u
  LEFT JOIN public.collaborators c ON lower(c.email) = lower(u.email)
  ORDER BY u.created_at DESC;
END;
$$;