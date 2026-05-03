-- 1) Fix has_permission to honor revoked permissions
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user_id
        AND permission_key = _key
        AND granted = true
    )
$$;

-- 2) Lock pm_resources SELECT
DROP POLICY IF EXISTS "Authenticated read pm_resources" ON public.pm_resources;
DROP POLICY IF EXISTS "Finance read pm_resources" ON public.pm_resources;
CREATE POLICY "Finance read pm_resources"
  ON public.pm_resources FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'));

-- 3) Rate-free public view of pm_resources
DROP VIEW IF EXISTS public.pm_resources_public;
CREATE VIEW public.pm_resources_public
WITH (security_invoker = on) AS
SELECT
  id, collaborator_id, name, full_name, role, team,
  weekly_capacity, color, phone, notes, email, active,
  rate_effective_from, created_at, updated_at
FROM public.pm_resources;
GRANT SELECT ON public.pm_resources_public TO authenticated;

-- 4) Lock quote_allocations SELECT (snapshots are sensitive)
DROP POLICY IF EXISTS "Authenticated read quote_allocations" ON public.quote_allocations;
DROP POLICY IF EXISTS "Finance read quote_allocations" ON public.quote_allocations;
CREATE POLICY "Finance read quote_allocations"
  ON public.quote_allocations FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'));

-- 5) Rate-free public view of quote_allocations
DROP VIEW IF EXISTS public.quote_allocations_public;
CREATE VIEW public.quote_allocations_public
WITH (security_invoker = on) AS
SELECT
  id, quote_id, stage_id, resource_id,
  start_date, end_date, hours_per_day, allocation_percentage,
  notes, created_at, updated_at
FROM public.quote_allocations;
GRANT SELECT ON public.quote_allocations_public TO authenticated;