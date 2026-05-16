
CREATE TABLE IF NOT EXISTS public.pending_user_permissions (
  email text NOT NULL,
  permission_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, permission_key)
);

ALTER TABLE public.pending_user_permissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins manage pending permissions"
    ON public.pending_user_permissions
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_pending_permission(_email text, _key text, _granted boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  e text := lower(trim(_email));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF e IS NULL OR e = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;

  IF _granted THEN
    INSERT INTO public.pending_user_permissions (email, permission_key)
    VALUES (e, _key)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.pending_user_permissions
    WHERE email = e AND permission_key = _key;
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.list_users_with_permissions();

CREATE OR REPLACE FUNCTION public.list_users_with_permissions()
RETURNS TABLE(
  user_id uuid,
  email text,
  is_admin boolean,
  is_super_admin boolean,
  collaborator_id uuid,
  collaborator_nome text,
  permissions text[],
  pending boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      (SELECT array_agg(up.permission_key ORDER BY up.permission_key)
       FROM public.user_permissions up WHERE up.user_id = u.id),
      ARRAY[]::text[]
    ) AS permissions,
    false AS pending
  FROM auth.users u
  LEFT JOIN public.collaborators c ON lower(c.email) = lower(u.email)

  UNION ALL

  SELECT
    c.id AS user_id,
    c.email::text,
    false AS is_admin,
    false AS is_super_admin,
    c.id AS collaborator_id,
    c.nome AS collaborator_nome,
    COALESCE(
      (SELECT array_agg(pp.permission_key ORDER BY pp.permission_key)
       FROM public.pending_user_permissions pp WHERE pp.email = lower(c.email)),
      ARRAY[]::text[]
    ) AS permissions,
    true AS pending
  FROM public.collaborators c
  WHERE c.archived_at IS NULL
    AND c.email IS NOT NULL
    AND c.email <> ''
    AND NOT EXISTS (
      SELECT 1 FROM auth.users u2 WHERE lower(u2.email) = lower(c.email)
    )
  ORDER BY 8 ASC, 6 NULLS LAST, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  e text := lower(NEW.email);
  has_pending boolean;
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  IF e = 'luis@pedrasilva.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.pending_user_permissions WHERE email = e) INTO has_pending;

  IF has_pending THEN
    INSERT INTO public.user_permissions (user_id, permission_key)
    SELECT NEW.id, pp.permission_key
    FROM public.pending_user_permissions pp
    WHERE pp.email = e
    ON CONFLICT DO NOTHING;

    DELETE FROM public.pending_user_permissions WHERE email = e;
  ELSE
    FOREACH k IN ARRAY default_keys LOOP
      INSERT INTO public.user_permissions (user_id, permission_key)
      VALUES (NEW.id, k)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
