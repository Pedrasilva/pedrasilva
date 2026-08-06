DROP POLICY IF EXISTS "Admins update bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Admins insert bank_accounts" ON public.bank_accounts;

CREATE POLICY "Finance users update bank_accounts"
ON public.bank_accounts FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.documents.edit'::text)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.documents.edit'::text)
);

CREATE POLICY "Finance users insert bank_accounts"
ON public.bank_accounts FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.documents.edit'::text)
);