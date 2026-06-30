
CREATE POLICY "Authenticated read collaborator photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'collaborator-photos');
