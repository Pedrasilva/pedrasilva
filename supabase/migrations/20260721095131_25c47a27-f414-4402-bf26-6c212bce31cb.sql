
CREATE POLICY "Upload own project note audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-note-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Read own project note audio"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-note-audio'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Delete own project note audio"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-note-audio'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );
