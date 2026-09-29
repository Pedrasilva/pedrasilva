DO $$ BEGIN CREATE TYPE public.marketing_channel AS ENUM ('hub','email','whatsapp'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.marketing_capture_status AS ENUM ('new','enriched','ready','used','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.marketing_clearance AS ENUM ('unknown','cleared','needs_client_approval','internal_only'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.marketing_sector AS ENUM ('workspace','healthcare','residential','hospitality','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.marketing_stage AS ENUM ('design','construction','completed','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.marketing_content_type AS ENUM ('photo','video','idea','story','quote','link'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.marketing_shelf_life AS ENUM ('urgent','seasonal','evergreen'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.marketing_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NULL,
  channel public.marketing_channel NOT NULL,
  sender_name text NULL,
  sender_email text NULL,
  source_message_id text NULL UNIQUE,
  raw_text text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  project_id uuid NULL REFERENCES public.pm_projects(id) ON DELETE SET NULL,
  sector public.marketing_sector NULL,
  stage public.marketing_stage NULL,
  content_type public.marketing_content_type NULL,
  pillar text NULL,
  fit_score numeric(4,1) NULL,
  ai_summary text NULL,
  missing_notes text NULL,
  curator_notes text NULL,
  status public.marketing_capture_status NOT NULL DEFAULT 'new',
  clearance public.marketing_clearance NOT NULL DEFAULT 'unknown',
  shelf_life public.marketing_shelf_life NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);
CREATE INDEX marketing_captures_status_idx ON public.marketing_captures(status);
CREATE INDEX marketing_captures_project_idx ON public.marketing_captures(project_id);
CREATE INDEX marketing_captures_created_by_idx ON public.marketing_captures(created_by);
CREATE INDEX marketing_captures_received_idx ON public.marketing_captures(received_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.marketing_captures TO authenticated;
GRANT ALL ON public.marketing_captures TO service_role;
ALTER TABLE public.marketing_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_captures_select" ON public.marketing_captures FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(),'marketing.view','all')
  OR (created_by = auth.uid() AND public.has_module_permission(auth.uid(),'marketing.view','own')));
CREATE POLICY "marketing_captures_insert" ON public.marketing_captures FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(),'marketing.contribute','own') AND created_by = auth.uid() AND channel = 'hub');
CREATE POLICY "marketing_captures_update" ON public.marketing_captures FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(),'marketing.curate','all'))
WITH CHECK (public.has_module_permission(auth.uid(),'marketing.curate','all'));

CREATE OR REPLACE FUNCTION public.marketing_captures_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.channel IS DISTINCT FROM OLD.channel
    OR NEW.sender_name IS DISTINCT FROM OLD.sender_name
    OR NEW.sender_email IS DISTINCT FROM OLD.sender_email
    OR NEW.source_message_id IS DISTINCT FROM OLD.source_message_id
    OR NEW.raw_text IS DISTINCT FROM OLD.raw_text
    OR NEW.received_at IS DISTINCT FROM OLD.received_at THEN
    RAISE EXCEPTION 'Original capture fields are immutable';
  END IF;
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_captures_guard_trg BEFORE UPDATE ON public.marketing_captures
FOR EACH ROW EXECUTE FUNCTION public.marketing_captures_guard();
REVOKE EXECUTE ON FUNCTION public.marketing_captures_guard() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.marketing_capture_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id uuid NOT NULL REFERENCES public.marketing_captures(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_capture_assets_capture_idx ON public.marketing_capture_assets(capture_id);
GRANT SELECT, INSERT, DELETE ON public.marketing_capture_assets TO authenticated;
GRANT ALL ON public.marketing_capture_assets TO service_role;
ALTER TABLE public.marketing_capture_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_assets_select" ON public.marketing_capture_assets FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.marketing_captures c WHERE c.id = capture_id));
CREATE POLICY "marketing_assets_insert" ON public.marketing_capture_assets FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.marketing_captures c WHERE c.id = capture_id
  AND (c.created_by = auth.uid() OR public.has_module_permission(auth.uid(),'marketing.curate','all'))));
CREATE POLICY "marketing_assets_delete" ON public.marketing_capture_assets FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(),'marketing.curate','all'));

-- Storage policies (bucket 'marketing-assets', path {capture_id}/...)
CREATE POLICY "marketing_assets_obj_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'marketing-assets' AND EXISTS (
  SELECT 1 FROM public.marketing_captures c WHERE c.id::text = (storage.foldername(name))[1]));
CREATE POLICY "marketing_assets_obj_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'marketing-assets' AND EXISTS (
  SELECT 1 FROM public.marketing_captures c WHERE c.id::text = (storage.foldername(name))[1]
  AND (c.created_by = auth.uid() OR public.has_module_permission(auth.uid(),'marketing.curate','all'))));
CREATE POLICY "marketing_assets_obj_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'marketing-assets' AND public.has_module_permission(auth.uid(),'marketing.curate','all'));

INSERT INTO public.role_permissions (role, permission_key, scope)
SELECT r::public.pm_role, k, 'own'
FROM unnest(ARRAY['partner','project_lead','architect','hr','finance']) r,
     unnest(ARRAY['marketing.contribute','marketing.view']) k
ON CONFLICT DO NOTHING;