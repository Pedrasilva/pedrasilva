
DROP POLICY IF EXISTS "proposal_pdfs_read" ON storage.objects;
DROP POLICY IF EXISTS "proposal_pdfs_insert" ON storage.objects;
DROP POLICY IF EXISTS "proposal_pdfs_update" ON storage.objects;
DROP POLICY IF EXISTS "proposal_pdfs_delete" ON storage.objects;

CREATE POLICY "proposal_pdfs_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'proposal-pdfs'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text))
  );

CREATE POLICY "proposal_pdfs_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-pdfs'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text))
  );

CREATE POLICY "proposal_pdfs_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'proposal-pdfs'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text))
  );

CREATE POLICY "proposal_pdfs_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proposal-pdfs'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text))
  );
