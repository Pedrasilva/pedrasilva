CREATE POLICY "Finance users read benefit receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'benefit-receipts'
  AND public.has_permission(auth.uid(), 'finance.dashboard')
);