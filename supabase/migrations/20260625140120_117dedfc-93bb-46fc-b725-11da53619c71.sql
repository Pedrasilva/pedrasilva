DROP POLICY IF EXISTS "Users self-allocate for timesheet" ON public.pm_allocations;

CREATE POLICY "Users self-allocate for timesheet"
ON public.pm_allocations
FOR INSERT
TO authenticated
WITH CHECK (resource_id = public.pm_get_my_resource_id());
