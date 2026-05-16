
-- 1. Helper to check the new approver permission via user_permissions
CREATE OR REPLACE FUNCTION public.can_approve_benefits(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions
    WHERE user_id = _user_id
      AND permission_key = 'hr.beneficios.approve'
  )
  OR public.has_role(_user_id, 'admin'::app_role);
$$;

-- 2. benefit_expenses: approvers can SELECT every expense (admins already could)
DROP POLICY IF EXISTS "Users see own expenses + admins all" ON public.benefit_expenses;
CREATE POLICY "Users see own expenses; approvers and admins see all"
ON public.benefit_expenses
FOR SELECT
TO authenticated
USING (
  public.can_approve_benefits(auth.uid())
  OR collaborator_id = public.get_my_collaborator_id()
);

-- 3. benefit_expenses: approvers can UPDATE any expense (to approve/reject/mark paid)
DROP POLICY IF EXISTS "Admins update; users update own pending expenses" ON public.benefit_expenses;
CREATE POLICY "Approvers update any; users update own pending expenses"
ON public.benefit_expenses
FOR UPDATE
TO authenticated
USING (
  public.can_approve_benefits(auth.uid())
  OR (
    collaborator_id = public.get_my_collaborator_id()
    AND estado = 'pendente'::expense_status
  )
)
WITH CHECK (
  public.can_approve_benefits(auth.uid())
  OR (
    collaborator_id = public.get_my_collaborator_id()
    AND estado = 'pendente'::expense_status
  )
);

-- 4. collaborators: approvers can read the list (names) to label expenses
CREATE POLICY "Benefit approvers read collaborators"
ON public.collaborators
FOR SELECT
TO authenticated
USING (public.can_approve_benefits(auth.uid()));
