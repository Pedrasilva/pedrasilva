-- ============================================================
-- Fix: switch to security_invoker views + column-level grants
-- ============================================================

-- ---------- Drop the previous views ----------
DROP VIEW IF EXISTS public.collaborators_directory;
DROP VIEW IF EXISTS public.pm_suppliers_directory;

-- ============================================================
-- COLLABORATORS
-- ============================================================
-- Drop and recreate the SELECT policy with two flavours:
-- 1. Admins / own row: full access (all columns).
-- 2. Other authenticated users: row-level access allowed BUT column-level
--    GRANTs restrict which columns can be returned.
DROP POLICY IF EXISTS "Admins or own read collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Authenticated read collaborators" ON public.collaborators;

CREATE POLICY "Authenticated read collaborators"
  ON public.collaborators FOR SELECT TO authenticated
  USING (true);

-- Revoke broad SELECT and grant only safe directory columns to authenticated.
-- Sensitive columns are NOT granted, so any attempt to select them as a
-- non-owner will fail with a permission error.
REVOKE SELECT ON public.collaborators FROM authenticated;

GRANT SELECT (
  id,
  nome,
  email,
  foto_path,
  departamento,
  language_preference,
  daily_hours,
  days_per_week,
  numero_colaborador,
  archived_at,
  archived_by,
  ano_fiscal,
  dias_ferias_anuais,
  dias_ferias_extra,
  data_nascimento,
  inicio_carreira,
  created_at,
  updated_at
) ON public.collaborators TO authenticated;

-- For admins / own-row to read sensitive columns we rely on a security
-- definer helper that bypasses column grants. Wrap it in a function used
-- by application code when full HR data is needed.
CREATE OR REPLACE FUNCTION public.get_collaborator_full(_id uuid)
RETURNS public.collaborators
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.collaborators
  WHERE id = _id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR id = public.get_my_collaborator_id()
    )
$$;

COMMENT ON FUNCTION public.get_collaborator_full(uuid) IS
  'Returns the full collaborator row INCLUDING sensitive HR fields (marital status, dependents, contract situation, salary override, location, leave balances). Only admins or the collaborator themselves may call this successfully; others get NULL.';

CREATE OR REPLACE FUNCTION public.list_collaborators_full(_include_archived boolean DEFAULT true)
RETURNS SETOF public.collaborators
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.collaborators
  WHERE public.has_role(auth.uid(), 'admin')
    AND (_include_archived OR archived_at IS NULL)
  ORDER BY nome
$$;

COMMENT ON FUNCTION public.list_collaborators_full(boolean) IS
  'Admin-only listing of all collaborators with full HR fields. Returns no rows for non-admins.';

-- ============================================================
-- PM_SUPPLIERS
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read pm_suppliers" ON public.pm_suppliers;
DROP POLICY IF EXISTS "Admins read pm_suppliers" ON public.pm_suppliers;

CREATE POLICY "Authenticated read pm_suppliers"
  ON public.pm_suppliers FOR SELECT TO authenticated
  USING (true);

REVOKE SELECT ON public.pm_suppliers FROM authenticated;

GRANT SELECT (id, name, active, created_at, updated_at)
  ON public.pm_suppliers TO authenticated;

CREATE OR REPLACE FUNCTION public.list_pm_suppliers_full()
RETURNS SETOF public.pm_suppliers
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.pm_suppliers
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY name
$$;

COMMENT ON FUNCTION public.list_pm_suppliers_full() IS
  'Admin-only listing of all suppliers including contact info and tax IDs. Returns no rows for non-admins.';