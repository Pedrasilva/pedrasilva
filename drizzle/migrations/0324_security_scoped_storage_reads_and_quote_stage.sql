REVOKE EXECUTE ON FUNCTION public.crm_quote_opportunity_stage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_quote_opportunity_stage(uuid) TO service_role;
ALTER POLICY "Authenticated read collaborator photos" ON storage.objects USING (bucket_id = 'collaborator-photos' AND public.is_psa_staff());
ALTER POLICY proposal_images_read_authenticated ON storage.objects USING (bucket_id = 'proposal-images' AND public.is_psa_staff());
ALTER POLICY marketing_assets_obj_select ON storage.objects USING (bucket_id = 'marketing-assets' AND public.is_psa_staff() AND EXISTS (SELECT 1 FROM public.marketing_captures c WHERE c.id::text = (storage.foldername(objects.name))[1]));