DROP POLICY IF EXISTS fc_admin_write ON public.financial_classifications;

CREATE POLICY fc_write ON public.financial_classifications
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
  OR has_module_permission(auth.uid(), 'finance.documents.edit'::text, 'all'::text)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
  OR has_module_permission(auth.uid(), 'finance.documents.edit'::text, 'all'::text)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_classifications TO authenticated;