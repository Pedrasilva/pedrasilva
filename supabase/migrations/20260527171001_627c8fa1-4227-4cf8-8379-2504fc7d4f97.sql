-- Align bank_accounts SELECT with bank_transactions / bank_statement_imports
DROP POLICY IF EXISTS "Admins read bank_accounts" ON public.bank_accounts;

CREATE POLICY "Finance users read bank_accounts"
ON public.bank_accounts
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
);
