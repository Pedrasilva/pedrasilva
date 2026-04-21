-- Add foto_path column to collaborators
ALTER TABLE public.collaborators
ADD COLUMN IF NOT EXISTS foto_path text;

-- Create public bucket for collaborator photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('collaborator-photos', 'collaborator-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies on storage.objects for this bucket
DROP POLICY IF EXISTS "Public read collaborator photos" ON storage.objects;
CREATE POLICY "Public read collaborator photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'collaborator-photos');

DROP POLICY IF EXISTS "Admins upload collaborator photos" ON storage.objects;
CREATE POLICY "Admins upload collaborator photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'collaborator-photos'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins update collaborator photos" ON storage.objects;
CREATE POLICY "Admins update collaborator photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'collaborator-photos'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins delete collaborator photos" ON storage.objects;
CREATE POLICY "Admins delete collaborator photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'collaborator-photos'
  AND public.has_role(auth.uid(), 'admin')
);