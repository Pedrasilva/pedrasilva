-- Public buckets serve files via direct CDN URLs without needing a SELECT
-- policy on storage.objects. Drop the listing policy so callers cannot
-- enumerate filenames in 'collaborator-photos'.
DROP POLICY IF EXISTS "Authenticated list collaborator photos" ON storage.objects;