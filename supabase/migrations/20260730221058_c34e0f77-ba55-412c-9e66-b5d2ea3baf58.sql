-- 1. Schema: multiple roles per user
ALTER TABLE public.user_role_assignments DROP CONSTRAINT user_role_assignments_pkey;
ALTER TABLE public.user_role_assignments ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.user_role_assignments ADD CONSTRAINT user_role_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.user_role_assignments ADD CONSTRAINT user_role_assignments_user_role_key UNIQUE (user_id, role);

-- 2. Assignment functions
CREATE OR REPLACE FUNCTION public.set_user_role(_user_id uuid, _role pm_role, _apply_preset boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.user_role_assignments (user_id, role, assigned_by)
  VALUES (_user_id, _role, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;

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
$function$;

CREATE OR REPLACE FUNCTION public.remove_user_role(_user_id uuid, _role pm_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.user_role_assignments
  WHERE user_id = _user_id AND role = _role;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_roles(_user_id uuid, _roles pm_role[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.user_role_assignments
  WHERE user_id = _user_id
    AND (_roles IS NULL OR NOT (role = ANY(_roles)));

  IF _roles IS NOT NULL THEN
    INSERT INTO public.user_role_assignments (user_id, role, assigned_by)
    SELECT _user_id, r, auth.uid()
    FROM unnest(_roles) AS r
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$function$;

-- 3. Admin listing returns all roles
DROP FUNCTION IF EXISTS public.list_users_with_role_v2();
CREATE OR REPLACE FUNCTION public.list_users_with_role_v2()
RETURNS TABLE(user_id uuid, email text, is_admin boolean, is_super_admin boolean, collaborator_id uuid, collaborator_nome text, assigned_roles pm_role[], suggested_role pm_role, effective_keys text[], effective_scopes text[], override_keys text[])
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
    u.id,
    u.email::text,
    EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin'),
    public.is_super_admin(u.id),
    c.id, c.nome,
    COALESCE(
      (SELECT array_agg(ura.role ORDER BY ura.role)
        FROM public.user_role_assignments ura WHERE ura.user_id = u.id),
      ARRAY[]::pm_role[]),
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
  ORDER BY u.created_at DESC;
END;
$function$;