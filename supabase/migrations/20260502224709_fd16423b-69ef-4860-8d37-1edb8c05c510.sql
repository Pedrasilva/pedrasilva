-- Restrict listing of objects in the public 'collaborator-photos' bucket.
-- Files remain publicly readable via their direct CDN URL (bucket is public),
-- but anonymous callers can no longer enumerate filenames via storage.objects.
DROP POLICY IF EXISTS "Public read collaborator photos" ON storage.objects;

CREATE POLICY "Authenticated list collaborator photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'collaborator-photos');