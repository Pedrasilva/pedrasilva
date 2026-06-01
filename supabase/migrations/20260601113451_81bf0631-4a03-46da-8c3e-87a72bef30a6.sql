-- Restrict benefit approvers from reading sensitive HR columns on collaborators.
-- Approvers only need id + nome + foto_path + archived_at to render approval UIs.

-- 1. Drop the broad approver SELECT policy on the base table.
DROP POLICY IF EXISTS "Benefit approvers read collaborators" ON public.collaborators;

-- 2. SECURITY DEFINER RPC returning only non-sensitive columns to approvers/admins/HR readers.
CREATE OR REPLACE FUNCTION public.list_collaborators_basic()
RETURNS TABLE(id uuid, nome text, foto_path text, archived_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'hr.colaboradores')
    OR public.has_permission(auth.uid(), 'hr.colaborador.view')
    OR public.can_approve_benefits(auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id, c.nome, c.foto_path, c.archived_at
    FROM public.collaborators c
   ORDER BY c.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.list_collaborators_basic() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_collaborators_basic() TO authenticated;