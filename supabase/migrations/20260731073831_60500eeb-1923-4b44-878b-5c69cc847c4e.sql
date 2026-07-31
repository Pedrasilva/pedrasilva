DROP POLICY IF EXISTS "Users see own time entries + admins all" ON public.pm_time_entries;
CREATE POLICY "Users see own time entries + admins all"
  ON public.pm_time_entries
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR user_id = auth.uid()
    OR has_module_permission(auth.uid(), 'timesheets.view_team', 'all')
    OR (
      has_module_permission(auth.uid(), 'timesheets.view_team', 'team')
      AND pm_has_team_access(auth.uid(), user_id)
    )
  );

INSERT INTO public.role_permissions (role, permission_key, scope)
VALUES ('architect', 'timesheets.view_team', 'team')
ON CONFLICT DO NOTHING;