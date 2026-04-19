CREATE OR REPLACE FUNCTION public.list_users_with_roles()
RETURNS TABLE (
  user_id uuid,
  email text,
  created_at timestamptz,
  is_admin boolean,
  collaborator_id uuid,
  collaborator_nome text,
  collaborator_departamento text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text AS email,
    u.created_at,
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = u.id AND ur.role = 'admin'
    ) AS is_admin,
    c.id AS collaborator_id,
    c.nome AS collaborator_nome,
    c.departamento::text AS collaborator_departamento
  FROM auth.users u
  LEFT JOIN public.collaborators c ON c.email = u.email
  ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_admin(_user_id uuid, _is_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _user_id = auth.uid() AND _is_admin = false THEN
    RAISE EXCEPTION 'cannot remove your own admin role';
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