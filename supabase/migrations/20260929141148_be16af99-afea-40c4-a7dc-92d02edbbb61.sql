DROP POLICY IF EXISTS marketing_assets_obj_insert ON storage.objects;
CREATE POLICY marketing_assets_obj_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'marketing-assets'
  AND EXISTS (
    SELECT 1 FROM public.marketing_captures c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND (c.created_by = auth.uid() OR public.has_module_permission(auth.uid(), 'marketing.curate', 'all'))
  )
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','gif','heic','heif','mp4','mov','m4v','webm','pdf')
);