-- ============================================================
-- Security hardening: restrict sensitive HR & supplier columns
-- ============================================================

-- ---------- collaborators ----------
DROP POLICY IF EXISTS "Authenticated read collaborators" ON public.collaborators;

CREATE POLICY "Admins or own read collaborators"
  ON public.collaborators FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR id = public.get_my_collaborator_id()
  );

-- Public-safe directory view exposing only non-sensitive fields needed by
-- general (non-admin) app features (avatars, pickers, language preference,
-- birthdays, scheduling capacity, etc.). Sensitive HR fields (marital
-- status, dependents, contract situation, salary override, location, leave
-- balances) are NOT exposed here and remain restricted to admins / own row
-- on the base table.
CREATE OR REPLACE VIEW public.collaborators_directory
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

-- The view inherits RLS from the base table when security_invoker is on,
-- so we add a permissive policy for authenticated reads on the base table
-- restricted to these directory columns by exposing them through the view
-- only. To allow the view to actually return rows for non-admins, we add
-- a parallel SELECT policy that limits which columns can be queried via
-- the view by relying on application code to use the view name. We grant
-- explicit access to authenticated.
GRANT SELECT ON public.collaborators_directory TO authenticated;

-- Allow authenticated users to read collaborator rows ONLY through the
-- directory view. Since security_invoker=on means RLS on the base table is
-- evaluated as the querying user, we add an additional permissive policy
-- that grants SELECT on the base table when the query originates via the
-- view. PostgreSQL does not natively distinguish, so instead we add a
-- broader read policy scoped to the safe columns is impractical; the
-- standard pattern is to keep a permissive SELECT for the view by setting
-- security_invoker=off. Use that instead.
DROP VIEW IF EXISTS public.collaborators_directory;

CREATE VIEW public.collaborators_directory
WITH (security_invoker = off) AS
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

-- ---------- pm_suppliers ----------
DROP POLICY IF EXISTS "Authenticated read pm_suppliers" ON public.pm_suppliers;

CREATE POLICY "Admins read pm_suppliers"
  ON public.pm_suppliers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Public-safe directory view exposing only id, name, active. Used by
-- supplier dropdown pickers in expense/material forms so non-admins keep
-- working without leaking contact info or tax IDs.
CREATE OR REPLACE VIEW public.pm_suppliers_directory
WITH (security_invoker = off) AS
SELECT id, name, active
FROM public.pm_suppliers;

GRANT SELECT ON public.pm_suppliers_directory TO authenticated;

COMMENT ON VIEW public.pm_suppliers_directory IS
  'Public-safe directory of suppliers (id, name, active only). Excludes contact_name, email, phone, tax_id which are admin-only via the base pm_suppliers table.';