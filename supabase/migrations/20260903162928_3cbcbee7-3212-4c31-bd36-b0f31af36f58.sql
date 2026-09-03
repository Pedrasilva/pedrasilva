CREATE POLICY "product_library_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'product-library');
CREATE POLICY "product_library_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-library');
CREATE POLICY "product_library_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-library') WITH CHECK (bucket_id = 'product-library');
CREATE POLICY "product_library_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-library');