DROP POLICY IF EXISTS "Finance users insert companies" ON public.companies;
DROP POLICY IF EXISTS "Finance users read companies" ON public.companies;
DROP POLICY IF EXISTS "Finance users update companies" ON public.companies;

CREATE POLICY "Finance or CRM users read companies"
ON public.companies FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.pipeline'::text)
);

CREATE POLICY "Finance or CRM users insert companies"
ON public.companies FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.pipeline'::text)
);

CREATE POLICY "Finance or CRM users update companies"
ON public.companies FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.pipeline'::text)
);