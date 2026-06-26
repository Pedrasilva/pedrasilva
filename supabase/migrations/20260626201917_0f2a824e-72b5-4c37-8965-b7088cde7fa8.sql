CREATE POLICY "Assignees update own pm_tasks"
ON public.pm_tasks
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.pm_allocations a
    WHERE a.id = pm_tasks.allocation_id
      AND a.resource_id = public.pm_get_my_resource_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pm_allocations a
    WHERE a.id = pm_tasks.allocation_id
      AND a.resource_id = public.pm_get_my_resource_id()
  )
);