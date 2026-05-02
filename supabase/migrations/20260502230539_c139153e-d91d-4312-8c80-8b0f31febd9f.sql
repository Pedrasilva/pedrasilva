-- Lock down financial tables: admin-only SELECT
DROP POLICY IF EXISTS "Authenticated read pm_expenses" ON public.pm_expenses;
CREATE POLICY "Admins read pm_expenses" ON public.pm_expenses
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated read pm_materials" ON public.pm_materials;
CREATE POLICY "Admins read pm_materials" ON public.pm_materials
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated read company_expenses" ON public.company_expenses;
CREATE POLICY "Admins read company_expenses" ON public.company_expenses
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can view import logs" ON public.financial_import_logs;
CREATE POLICY "Admins read financial_import_logs" ON public.financial_import_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));