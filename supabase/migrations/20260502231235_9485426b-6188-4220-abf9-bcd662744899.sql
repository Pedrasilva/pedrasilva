-- Restore non-admin read access on pm_resources so the project planner /
-- Gantt can list resources and resolve allocation embeds. The admin-only
-- INSERT/UPDATE/DELETE policies stay in place; only SELECT becomes broad again.
DROP POLICY IF EXISTS "Admins read pm_resources" ON public.pm_resources;
CREATE POLICY "Authenticated read pm_resources" ON public.pm_resources
  FOR SELECT TO authenticated
  USING (true);