INSERT INTO public.user_role_assignments (user_id, role, notes)
SELECT u.id, 'architect', 'backfill: default project visibility'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_role_assignments a WHERE a.user_id = u.id);

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
  e text := lower(NEW.email);
  has_pending boolean;
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_role_assignments (user_id, role, notes)
  VALUES (NEW.id, 'architect', 'default role on signup')
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
$$;