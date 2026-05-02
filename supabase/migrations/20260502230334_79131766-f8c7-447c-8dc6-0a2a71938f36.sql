-- Make pm_resources_public a security-definer view so non-admins can read
-- the non-sensitive resource fields (id, name, color, role, collaborator_id)
-- via the planner. Sensitive columns (rates, email, weekly_capacity, etc.)
-- are excluded from the view definition itself.
ALTER VIEW public.pm_resources_public SET (security_invoker = false);

-- Ensure authenticated users can read the view.
GRANT SELECT ON public.pm_resources_public TO authenticated, anon;