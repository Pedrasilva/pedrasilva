CREATE OR REPLACE FUNCTION public.get_user_id_for_collaborator(p_collaborator_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.collaborators c
  JOIN auth.users u ON lower(u.email) = lower(c.email)
  WHERE c.id = p_collaborator_id
    AND public.has_role(auth.uid(), 'admin'::app_role)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_for_collaborator(uuid) TO authenticated;