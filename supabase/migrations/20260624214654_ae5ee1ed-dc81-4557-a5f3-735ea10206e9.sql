CREATE POLICY "Users self-allocate for timesheet" ON public.pm_allocations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pm_resources r
    WHERE r.id = pm_allocations.resource_id
      AND lower(r.email) = lower((auth.jwt() ->> 'email'))
  )
);