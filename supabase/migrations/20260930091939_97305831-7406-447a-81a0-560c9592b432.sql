CREATE TYPE public.marketing_platform AS ENUM ('instagram','linkedin');
CREATE TYPE public.marketing_draft_status AS ENUM ('suggested','approved','rejected','published');
CREATE TYPE public.marketing_draft_readiness AS ENUM ('ready','needs_approval','blocked');

CREATE TABLE public.marketing_post_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  brief text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  idea_count integer NOT NULL CHECK (idea_count BETWEEN 1 AND 10),
  source_capture_id uuid REFERENCES public.marketing_captures(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  error text,
  bible_version integer,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.marketing_post_requests TO authenticated;
GRANT ALL ON public.marketing_post_requests TO service_role;
ALTER TABLE public.marketing_post_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY mpr_select ON public.marketing_post_requests FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.curate','all'));
CREATE POLICY mpr_insert ON public.marketing_post_requests FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission(auth.uid(),'marketing.curate','all'));
CREATE POLICY mpr_update ON public.marketing_post_requests FOR UPDATE TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.curate','all'))
  WITH CHECK (public.has_module_permission(auth.uid(),'marketing.curate','all'));
CREATE INDEX ON public.marketing_post_requests (created_at DESC);

CREATE TABLE public.marketing_post_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.marketing_post_requests(id) ON DELETE CASCADE,
  idea_id uuid NOT NULL,
  platform public.marketing_platform NOT NULL,
  capture_ids uuid[] NOT NULL,
  asset_ids uuid[] NOT NULL DEFAULT '{}',
  project_id uuid,
  pillar text,
  persona text,
  ai_copy text NOT NULL,
  ai_hashtags text[] NOT NULL DEFAULT '{}',
  final_copy text,
  final_hashtags text[],
  rationale text NOT NULL,
  readiness public.marketing_draft_readiness NOT NULL,
  readiness_note text,
  safety_flags text[] NOT NULL DEFAULT '{}',
  status public.marketing_draft_status NOT NULL DEFAULT 'suggested',
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  published_at date,
  published_url text,
  bible_version integer NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.marketing_post_drafts TO authenticated;
GRANT ALL ON public.marketing_post_drafts TO service_role;
ALTER TABLE public.marketing_post_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY mpd_select ON public.marketing_post_drafts FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.curate','all'));
CREATE POLICY mpd_insert ON public.marketing_post_drafts FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission(auth.uid(),'marketing.curate','all'));
CREATE POLICY mpd_update ON public.marketing_post_drafts FOR UPDATE TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.curate','all'))
  WITH CHECK (public.has_module_permission(auth.uid(),'marketing.curate','all'));
CREATE INDEX ON public.marketing_post_drafts (request_id);
CREATE INDEX ON public.marketing_post_drafts (status, decided_at);

CREATE OR REPLACE FUNCTION public.marketing_post_drafts_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ai_copy IS DISTINCT FROM OLD.ai_copy OR NEW.ai_hashtags IS DISTINCT FROM OLD.ai_hashtags
     OR NEW.capture_ids IS DISTINCT FROM OLD.capture_ids OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.idea_id IS DISTINCT FROM OLD.idea_id OR NEW.platform IS DISTINCT FROM OLD.platform
     OR NEW.bible_version IS DISTINCT FROM OLD.bible_version OR NEW.model IS DISTINCT FROM OLD.model
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'AI original fields of a post draft cannot be changed';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'published' AND OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'Only approved drafts can be marked as published';
    END IF;
    IF NEW.status = 'approved' AND NEW.readiness <> 'ready' THEN
      RAISE EXCEPTION 'Only ready drafts can be approved';
    END IF;
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_post_drafts_guard BEFORE UPDATE ON public.marketing_post_drafts
  FOR EACH ROW EXECUTE FUNCTION public.marketing_post_drafts_guard();

CREATE OR REPLACE FUNCTION public.marketing_post_drafts_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    UPDATE public.marketing_captures SET status = 'used' WHERE id = ANY (NEW.capture_ids);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_post_drafts_published() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER marketing_post_drafts_published AFTER UPDATE ON public.marketing_post_drafts
  FOR EACH ROW EXECUTE FUNCTION public.marketing_post_drafts_published();