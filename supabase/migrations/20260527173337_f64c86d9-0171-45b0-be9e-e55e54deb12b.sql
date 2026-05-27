
DROP POLICY IF EXISTS "Admins read companies" ON public.companies;
DROP POLICY IF EXISTS "Admins insert companies" ON public.companies;
DROP POLICY IF EXISTS "Admins update companies" ON public.companies;

CREATE POLICY "Finance users read companies"
ON public.companies FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'));

CREATE POLICY "Finance users insert companies"
ON public.companies FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'));

CREATE POLICY "Finance users update companies"
ON public.companies FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'));
