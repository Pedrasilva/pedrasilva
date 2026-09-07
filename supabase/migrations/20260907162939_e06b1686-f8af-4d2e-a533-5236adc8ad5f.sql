-- Hoist constant permission checks into InitPlans (scalar subselects) so they
-- are evaluated once per query instead of once per row. Logic is unchanged.

DROP POLICY IF EXISTS "bt_read" ON public.bank_transactions;
CREATE POLICY "bt_read" ON public.bank_transactions
FOR SELECT TO authenticated
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_permission((SELECT auth.uid()), 'finance.dashboard'::text))
);

DROP POLICY IF EXISTS "Finance users can read review queue" ON public.financial_document_review_queue;
CREATE POLICY "Finance users can read review queue" ON public.financial_document_review_queue
FOR SELECT TO authenticated
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_permission((SELECT auth.uid()), 'finance.dashboard'::text))
);

DROP POLICY IF EXISTS "findoc_read" ON public.financial_documents;
CREATE POLICY "findoc_read" ON public.financial_documents
FOR SELECT TO authenticated
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_permission((SELECT auth.uid()), 'finance.dashboard'::text))
  OR (SELECT public.has_module_permission((SELECT auth.uid()), 'finance.documents.view'::text, 'all'::text))
);

DROP POLICY IF EXISTS "Members read pm_allocations" ON public.pm_allocations;
CREATE POLICY "Members read pm_allocations" ON public.pm_allocations
FOR SELECT TO authenticated
USING (
  (SELECT public.pm_can_view_projects((SELECT auth.uid())))
  OR resource_id = (SELECT public.pm_get_my_resource_id())
);

DROP POLICY IF EXISTS "Members read pm_tasks" ON public.pm_tasks;
CREATE POLICY "Members read pm_tasks" ON public.pm_tasks
FOR SELECT TO authenticated
USING (
  (SELECT public.pm_can_view_projects((SELECT auth.uid())))
  OR EXISTS (
    SELECT 1 FROM public.pm_allocations a
    WHERE a.id = pm_tasks.allocation_id
      AND a.resource_id = (SELECT public.pm_get_my_resource_id())
  )
);

DROP POLICY IF EXISTS "Authorized read pm_stages" ON public.pm_stages;
CREATE POLICY "Authorized read pm_stages" ON public.pm_stages
FOR SELECT TO authenticated
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_permission((SELECT auth.uid()), 'finance.dashboard'::text))
  OR (SELECT public.has_permission((SELECT auth.uid()), 'projects.financials'::text))
  OR (SELECT public.has_permission((SELECT auth.uid()), 'projects.all'::text))
  OR (SELECT public.has_module_permission((SELECT auth.uid()), 'projects.view'::text, 'all'::text))
  OR (
    (SELECT public.has_module_permission((SELECT auth.uid()), 'projects.view'::text, 'assigned'::text))
    AND project_id IS NOT NULL
    AND public.pm_has_assigned_access((SELECT auth.uid()), project_id)
  )
  OR (
    (SELECT public.has_module_permission((SELECT auth.uid()), 'projects.view'::text, 'own'::text))
    AND public.pm_is_retainer_stage(id)
  )
);
