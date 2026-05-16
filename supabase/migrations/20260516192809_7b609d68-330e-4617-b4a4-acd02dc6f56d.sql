-- Phase 1b: route all approver/payer status changes through
-- benefit_expense_set_status (SECURITY DEFINER). Admins keep a direct
-- escape hatch for ad-hoc fixes. Owners may still edit their own pending.

DROP POLICY IF EXISTS "Approvers update any; users update own pending expenses"
  ON public.benefit_expenses;

CREATE POLICY "Admins update any; users update own pending expenses"
  ON public.benefit_expenses
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      collaborator_id = public.get_my_collaborator_id()
      AND estado = 'pendente'::public.expense_status
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      collaborator_id = public.get_my_collaborator_id()
      AND estado = 'pendente'::public.expense_status
    )
  );
