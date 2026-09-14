DROP POLICY IF EXISTS "Approved visible to all; own + approvers see all" ON public.remote_work_requests;
CREATE POLICY "Approved visible to all; own + approvers see all"
ON public.remote_work_requests FOR SELECT
USING (
  estado IN ('aprovada','declarada')
  OR collaborator_id = public.get_my_collaborator_id()
  OR public.remote_work_can_approve(auth.uid(), collaborator_id)
);

DROP POLICY IF EXISTS "Approvers decide; users cancel own" ON public.remote_work_requests;
CREATE POLICY "Approvers decide; users cancel own"
ON public.remote_work_requests FOR UPDATE
USING (
  public.remote_work_can_approve(auth.uid(), collaborator_id)
  OR (collaborator_id = public.get_my_collaborator_id()
      AND estado IN ('pendente','aprovada','declarada'))
)
WITH CHECK (
  public.remote_work_can_approve(auth.uid(), collaborator_id)
  OR (collaborator_id = public.get_my_collaborator_id()
      AND estado IN ('pendente','declarada','cancelada'))
);