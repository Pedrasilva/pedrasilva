CREATE OR REPLACE FUNCTION public.pm_project_has_retainer(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pm_stages s
    WHERE s.project_id = _project_id
      AND s.stage_kind IN ('retainer_monthly','retainer_month','retainer')
  );
$$;

DROP POLICY IF EXISTS "Authorized read pm_stages" ON public.pm_stages;
CREATE POLICY "Authorized read pm_stages"
ON public.pm_stages FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
  OR has_permission(auth.uid(), 'projects.financials'::text)
  OR has_permission(auth.uid(), 'projects.all'::text)
  OR has_module_permission(auth.uid(), 'projects.view'::text, 'all'::text)
  OR (
    has_module_permission(auth.uid(), 'projects.view'::text, 'assigned'::text)
    AND project_id IS NOT NULL
    AND pm_has_assigned_access(auth.uid(), project_id)
  )
  -- Retainer stages use open logging: any project-viewer may see (and log against) them,
  -- mirroring direct stage-level logging on regular stages.
  OR (
    public.pm_is_retainer_stage(id)
    AND has_module_permission(auth.uid(), 'projects.view'::text, 'own'::text)
  )
);
