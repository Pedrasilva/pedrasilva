-- Add 'image' to psa_block_type enum
ALTER TYPE public.psa_block_type ADD VALUE IF NOT EXISTS 'image';

-- Image library table
CREATE TABLE public.psa_image_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  storage_path text NOT NULL,
  bucket text NOT NULL DEFAULT 'proposal-images',
  size_hint text,
  width integer,
  height integer,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.psa_image_library TO authenticated;
GRANT ALL ON public.psa_image_library TO service_role;

ALTER TABLE public.psa_image_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psa_image_library_read_authenticated"
  ON public.psa_image_library FOR SELECT TO authenticated USING (true);

CREATE POLICY "psa_image_library_insert_authenticated"
  ON public.psa_image_library FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "psa_image_library_update_authenticated"
  ON public.psa_image_library FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "psa_image_library_delete_authenticated"
  ON public.psa_image_library FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_psa_image_library_updated_at
  BEFORE UPDATE ON public.psa_image_library
  FOR EACH ROW EXECUTE FUNCTION public.psa_set_updated_at();

-- Storage policies for proposal-images bucket
CREATE POLICY "proposal_images_read_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'proposal-images');

CREATE POLICY "proposal_images_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'proposal-images');

CREATE POLICY "proposal_images_update_authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'proposal-images');

CREATE POLICY "proposal_images_delete_authenticated"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'proposal-images');
