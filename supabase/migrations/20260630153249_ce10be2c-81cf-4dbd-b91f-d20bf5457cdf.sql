CREATE POLICY "Users self-update own pm_allocations" ON public.pm_allocations FOR UPDATE TO authenticated USING (resource_id = public.pm_get_my_resource_id()) WITH CHECK (resource_id = public.pm_get_my_resource_id());

CREATE POLICY "Users self-delete own pm_allocations" ON public.pm_allocations FOR DELETE TO authenticated USING (resource_id = public.pm_get_my_resource_id());