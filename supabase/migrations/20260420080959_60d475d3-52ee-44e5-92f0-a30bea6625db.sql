DROP POLICY IF EXISTS "Authenticated insert pm_activities" ON public.pm_activities;
DROP POLICY IF EXISTS "Authenticated update pm_activities" ON public.pm_activities;
DROP POLICY IF EXISTS "Authenticated insert pm_activity_replies" ON public.pm_activity_replies;
DROP POLICY IF EXISTS "Authenticated update pm_activity_replies" ON public.pm_activity_replies;

CREATE POLICY "Members insert pm_activities" ON public.pm_activities FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR author_resource_id IS NULL
    OR author_resource_id = pm_get_my_resource_id()
  );

CREATE POLICY "Members update own pm_activities" ON public.pm_activities FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR author_resource_id = pm_get_my_resource_id()
  );

CREATE POLICY "Members insert pm_activity_replies" ON public.pm_activity_replies FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR author_resource_id IS NULL
    OR author_resource_id = pm_get_my_resource_id()
  );

CREATE POLICY "Members update own pm_activity_replies" ON public.pm_activity_replies FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR author_resource_id = pm_get_my_resource_id()
  );