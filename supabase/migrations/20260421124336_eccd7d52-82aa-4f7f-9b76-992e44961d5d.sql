CREATE OR REPLACE FUNCTION public.list_users_with_permissions()
 RETURNS TABLE(user_id uuid, email text, is_admin boolean, is_super_admin boolean, collaborator_id uuid, collaborator_nome text, permissions text[])
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
    ) AS permissions
  FROM auth.users u
  LEFT JOIN public.collaborators c ON lower(c.email) = lower(u.email)
  ORDER BY u.created_at DESC;
END;
$function$;