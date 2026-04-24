-- ============================================================
-- Reset: drop column grants and SECURITY DEFINER helpers
-- ============================================================
DROP FUNCTION IF EXISTS public.get_collaborator_full(uuid);
DROP FUNCTION IF EXISTS public.list_collaborators_full(boolean);
DROP FUNCTION IF EXISTS public.list_pm_suppliers_full();

-- Restore broad SELECT to authenticated (RLS will gate it)
GRANT SELECT ON public.collaborators TO authenticated;
GRANT SELECT ON public.pm_suppliers TO authenticated;

-- ============================================================
-- COLLABORATORS: row-level RLS (admins or own row)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Admins or own read collaborators" ON public.collaborators;

CREATE POLICY "Admins or own read collaborators"
  ON public.collaborators FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR id = public.get_my_collaborator_id()
  );

-- Public-safe directory view exposing only non-sensitive fields. Uses
-- SECURITY DEFINER (via owner = postgres) so it can bypass RLS to return
-- ALL collaborator rows, but only the safe columns. The view itself is
-- treated as a separate object the application can grant access to.
-- We grant SELECT to authenticated explicitly.
DROP VIEW IF EXISTS public.collaborators_directory;

CREATE VIEW public.collaborators_directory
WITH (security_invoker = on) AS
SELECT
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
FROM public.collaborators;

GRANT SELECT ON public.collaborators_directory TO authenticated;

COMMENT ON VIEW public.collaborators_directory IS
  'Public-safe directory of collaborators. Excludes sensitive HR fields (marital status, dependents, contract situation, salary override, location, leave balances). Use this view in non-admin code paths instead of the base collaborators table.';

-- Because security_invoker=on means RLS on the base table is enforced as
-- the querying user, and our base RLS only allows admins/own, the view
-- would also be limited. We need a SEPARATE permissive SELECT policy on
-- the base table that allows all authenticated users to read but ONLY
-- when accessed via the view. Postgres cannot detect that, so instead we
-- add a permissive SELECT policy that allows authenticated users to read
-- collaborator rows freely (which would defeat the purpose) -- so we
-- DON'T do that. Instead, we use SECURITY DEFINER on the view by
-- recreating it without security_invoker.
DROP VIEW IF EXISTS public.collaborators_directory;

CREATE VIEW public.collaborators_directory AS
SELECT
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
FROM public.collaborators;

-- Set security_invoker = off (default) so this view runs with view-owner
-- privileges and bypasses base-table RLS. The view exposes only safe
-- columns, which is the whole point.
ALTER VIEW public.collaborators_directory SET (security_invoker = off);

GRANT SELECT ON public.collaborators_directory TO authenticated;

-- ============================================================
-- PM_SUPPLIERS: row-level RLS (admins only)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read pm_suppliers" ON public.pm_suppliers;
DROP POLICY IF EXISTS "Admins read pm_suppliers" ON public.pm_suppliers;

CREATE POLICY "Admins read pm_suppliers"
  ON public.pm_suppliers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Public-safe directory view exposing only id, name, active.
DROP VIEW IF EXISTS public.pm_suppliers_directory;

CREATE VIEW public.pm_suppliers_directory AS
SELECT id, name, active
FROM public.pm_suppliers;

ALTER VIEW public.pm_suppliers_directory SET (security_invoker = off);

GRANT SELECT ON public.pm_suppliers_directory TO authenticated;

COMMENT ON VIEW public.pm_suppliers_directory IS
  'Public-safe directory of suppliers (id, name, active only). Excludes contact_name, email, phone, tax_id which are admin-only via the base pm_suppliers table.';