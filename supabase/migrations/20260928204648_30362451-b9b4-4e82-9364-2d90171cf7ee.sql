INSERT INTO public.role_permissions (role, permission_key, scope) VALUES
  ('admin','products.edit','all'), ('project_lead','products.edit','all')
ON CONFLICT DO NOTHING;

-- Library tables: read = products.view, write = products.edit
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['library_products','product_categories','product_files'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), ''products.view'', ''all''))', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_module_permission(auth.uid(), ''products.edit'', ''all''))', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_module_permission(auth.uid(), ''products.edit'', ''all'')) WITH CHECK (public.has_module_permission(auth.uid(), ''products.edit'', ''all''))', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_module_permission(auth.uid(), ''products.edit'', ''all''))', t||'_delete', t);
  END LOOP;
END $$;

-- Project schedules: everything = products.view
DROP POLICY IF EXISTS project_items_read ON public.project_items;
DROP POLICY IF EXISTS project_items_write ON public.project_items;
CREATE POLICY project_items_read ON public.project_items FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'products.view', 'all'));
CREATE POLICY project_items_insert ON public.project_items FOR INSERT TO authenticated WITH CHECK (public.has_module_permission(auth.uid(), 'products.view', 'all'));
CREATE POLICY project_items_update ON public.project_items FOR UPDATE TO authenticated USING (public.has_module_permission(auth.uid(), 'products.view', 'all')) WITH CHECK (public.has_module_permission(auth.uid(), 'products.view', 'all'));
CREATE POLICY project_items_delete ON public.project_items FOR DELETE TO authenticated USING (public.has_module_permission(auth.uid(), 'products.view', 'all'));

-- Storage bucket product-library
DROP POLICY IF EXISTS product_library_read ON storage.objects;
DROP POLICY IF EXISTS product_library_insert ON storage.objects;
DROP POLICY IF EXISTS product_library_update ON storage.objects;
DROP POLICY IF EXISTS product_library_delete ON storage.objects;
CREATE POLICY product_library_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'product-library' AND public.has_module_permission(auth.uid(), 'products.view', 'all'));
CREATE POLICY product_library_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-library' AND public.has_module_permission(auth.uid(), 'products.view', 'all'));
CREATE POLICY product_library_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-library' AND public.has_module_permission(auth.uid(), 'products.edit', 'all')) WITH CHECK (bucket_id = 'product-library' AND public.has_module_permission(auth.uid(), 'products.edit', 'all'));
CREATE POLICY product_library_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-library' AND public.has_module_permission(auth.uid(), 'products.edit', 'all'));