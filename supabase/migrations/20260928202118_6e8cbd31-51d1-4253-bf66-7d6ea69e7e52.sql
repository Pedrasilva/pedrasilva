DROP POLICY IF EXISTS inv_assets_read ON public.inventory_assets;
CREATE POLICY inv_assets_read ON public.inventory_assets FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'inventory.view', 'all') OR public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS inv_assign_read ON public.inventory_assignments;
CREATE POLICY inv_assign_read ON public.inventory_assignments FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'inventory.view', 'all') OR public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS inv_categories_read ON public.inventory_categories;
CREATE POLICY inv_categories_read ON public.inventory_categories FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'inventory.view', 'all') OR public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS inv_kits_read ON public.inventory_kits;
CREATE POLICY inv_kits_read ON public.inventory_kits FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'inventory.view', 'all') OR public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS inv_events_read ON public.inventory_asset_events;
CREATE POLICY inv_events_read ON public.inventory_asset_events FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'inventory.view', 'all') OR public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS inv_docs_read ON public.inventory_asset_documents;
CREATE POLICY inv_docs_read ON public.inventory_asset_documents FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'inventory.view', 'all') OR public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can read inventory line skips" ON public.inventory_line_skips;
CREATE POLICY "Inventory viewers read line skips" ON public.inventory_line_skips FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'inventory.view', 'all') OR public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS "Authenticated read inventory managers" ON public.inventory_managers;
CREATE POLICY "Inventory viewers read inventory managers" ON public.inventory_managers FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'inventory.view', 'all') OR public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS inv_counters_read ON public.inventory_code_counters;
CREATE POLICY inv_counters_read ON public.inventory_code_counters FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'inventory.view', 'all') OR public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS email_rules_auth_read ON public.email_rules;
CREATE POLICY email_rules_triage_read ON public.email_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'inbox.triage'));
DROP POLICY IF EXISTS email_sender_rules_staff_read ON public.email_sender_rules;
CREATE POLICY email_sender_rules_triage_read ON public.email_sender_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'inbox.triage'));