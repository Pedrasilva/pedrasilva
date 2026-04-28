-- Private bucket for supplier/client invoice PDFs and receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('financial-documents', 'financial-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Read: finance users only
CREATE POLICY "findoc_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'))
  );

-- Insert: finance users only
CREATE POLICY "findoc_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'financial-documents'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'))
  );

-- Update: finance users only
CREATE POLICY "findoc_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'))
  );

-- Delete: finance users only
CREATE POLICY "findoc_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'))
  );
