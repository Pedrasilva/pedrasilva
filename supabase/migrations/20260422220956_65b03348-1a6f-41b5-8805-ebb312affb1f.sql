
CREATE OR REPLACE FUNCTION public.pm_list_user_resource_map()
RETURNS TABLE(user_id uuid, resource_id uuid, name text, collaborator_id uuid, foto_path text, color text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    u.id AS user_id,
    r.id AS resource_id,
    COALESCE(c.nome, r.name, u.email::text) AS name,
    c.id AS collaborator_id,
    c.foto_path,
    r.color
  FROM auth.users u
  LEFT JOIN public.collaborators c ON lower(c.email) = lower(u.email)
  LEFT JOIN public.pm_resources r ON r.collaborator_id = c.id OR lower(r.email) = lower(u.email);
$$;

GRANT EXECUTE ON FUNCTION public.pm_list_user_resource_map() TO authenticated;
