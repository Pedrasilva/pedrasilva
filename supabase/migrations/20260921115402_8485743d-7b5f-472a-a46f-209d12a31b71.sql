-- Projects: allow project editors to create projects (was admin-only)
DROP POLICY IF EXISTS "Admins insert pm_projects" ON public.pm_projects;
CREATE POLICY "Authorized insert pm_projects"
ON public.pm_projects FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'projects.all'::text)
  OR has_permission(auth.uid(), 'projects.edit_planning'::text)
  OR has_permission(auth.uid(), 'projects.edit_stages'::text)
  OR has_module_permission(auth.uid(), 'projects.edit_stages'::text, 'all'::text)
);

-- Contacts: CRM/Finance users can read, create and edit (was admin-only)
DROP POLICY IF EXISTS "Admins read contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins update contacts" ON public.contacts;

CREATE POLICY "Finance or CRM users read contacts"
ON public.contacts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.pipeline'::text)
  OR has_permission(auth.uid(), 'crm.companies'::text)
  OR has_permission(auth.uid(), 'crm.contacts'::text)
);

CREATE POLICY "Finance or CRM users insert contacts"
ON public.contacts FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.pipeline'::text)
  OR has_permission(auth.uid(), 'crm.companies'::text)
  OR has_permission(auth.uid(), 'crm.contacts'::text)
);

CREATE POLICY "Finance or CRM users update contacts"
ON public.contacts FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.dashboard'::text)
  OR has_permission(auth.uid(), 'crm.pipeline'::text)
  OR has_permission(auth.uid(), 'crm.companies'::text)
  OR has_permission(auth.uid(), 'crm.contacts'::text)
);
