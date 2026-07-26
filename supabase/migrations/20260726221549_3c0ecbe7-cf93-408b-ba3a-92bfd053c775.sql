-- 1. Proposal snapshots read restriction
DROP POLICY IF EXISTS "Authenticated can read proposal snapshots" ON public.psa_proposal_snapshots;
CREATE POLICY "Admins, pipeline users or owners read proposal snapshots"
ON public.psa_proposal_snapshots FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'crm.pipeline'::text)
  OR created_by = auth.uid()
);

-- 2. Image library insert must record real owner
DROP POLICY IF EXISTS psa_image_library_insert_authenticated ON public.psa_image_library;
CREATE POLICY psa_image_library_insert_authenticated
ON public.psa_image_library FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

-- 3. Storage: proposal-images ownership scoping
DROP POLICY IF EXISTS proposal_images_insert_authenticated ON storage.objects;
DROP POLICY IF EXISTS proposal_images_update_authenticated ON storage.objects;
DROP POLICY IF EXISTS proposal_images_delete_authenticated ON storage.objects;

CREATE POLICY proposal_images_insert_authenticated
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'proposal-images' AND owner = auth.uid());

CREATE POLICY proposal_images_update_authenticated
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'proposal-images' AND (owner = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
WITH CHECK (bucket_id = 'proposal-images' AND (owner = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY proposal_images_delete_authenticated
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'proposal-images' AND (owner = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)));

-- 4. Quote templates read restriction
DROP POLICY IF EXISTS "Authenticated read quote_templates" ON public.quote_templates;
CREATE POLICY "Privileged read quote_templates" ON public.quote_templates FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text) OR has_permission(auth.uid(), 'finance.dashboard'::text));

DROP POLICY IF EXISTS "Authenticated read quote_template_stages" ON public.quote_template_stages;
CREATE POLICY "Privileged read quote_template_stages" ON public.quote_template_stages FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text) OR has_permission(auth.uid(), 'finance.dashboard'::text));

DROP POLICY IF EXISTS "Authenticated read quote_template_allocations" ON public.quote_template_allocations;
CREATE POLICY "Privileged read quote_template_allocations" ON public.quote_template_allocations FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text) OR has_permission(auth.uid(), 'finance.dashboard'::text));

DROP POLICY IF EXISTS "Authenticated read quote_template_payment_rules" ON public.quote_template_payment_rules;
CREATE POLICY "Privileged read quote_template_payment_rules" ON public.quote_template_payment_rules FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text) OR has_permission(auth.uid(), 'finance.dashboard'::text));

DROP POLICY IF EXISTS "Authenticated read quote_template_dependencies" ON public.quote_template_dependencies;
CREATE POLICY "Privileged read quote_template_dependencies" ON public.quote_template_dependencies FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text) OR has_permission(auth.uid(), 'finance.dashboard'::text));

DROP POLICY IF EXISTS "Authenticated read quote_template_blocks" ON public.quote_template_blocks;
CREATE POLICY "Privileged read quote_template_blocks" ON public.quote_template_blocks FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text) OR has_permission(auth.uid(), 'finance.dashboard'::text));

DROP POLICY IF EXISTS "Authenticated read quote_template_external_services" ON public.quote_template_external_services;
CREATE POLICY "Privileged read quote_template_external_services" ON public.quote_template_external_services FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text) OR has_permission(auth.uid(), 'finance.dashboard'::text));