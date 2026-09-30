CREATE TABLE public.marketing_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id uuid NOT NULL REFERENCES public.marketing_captures(id) ON DELETE CASCADE,
  project_id uuid NULL,
  architect_user_id uuid NOT NULL,
  question text NOT NULL,
  ai_suggested_question text NOT NULL,
  channel text NOT NULL DEFAULT 'hub' CHECK (channel IN ('hub','email','whatsapp')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','answered','dismissed','expired')),
  answer_text text NULL,
  answer_audio_path text NULL,
  answered_at timestamptz NULL,
  story_suggestion_id uuid NULL REFERENCES public.marketing_project_story_suggestions(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  expires_at timestamptz NULL
);
CREATE INDEX marketing_nudges_capture_idx ON public.marketing_nudges(capture_id);
CREATE INDEX marketing_nudges_architect_idx ON public.marketing_nudges(architect_user_id, status);

GRANT SELECT, INSERT, UPDATE ON public.marketing_nudges TO authenticated;
GRANT ALL ON public.marketing_nudges TO service_role;
ALTER TABLE public.marketing_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY mn_select ON public.marketing_nudges FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.curate', 'all') OR architect_user_id = auth.uid());
CREATE POLICY mn_insert ON public.marketing_nudges FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission(auth.uid(), 'marketing.curate', 'all'));
CREATE POLICY mn_update_curator ON public.marketing_nudges FOR UPDATE TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.curate', 'all'))
  WITH CHECK (public.has_module_permission(auth.uid(), 'marketing.curate', 'all'));
CREATE POLICY mn_update_architect ON public.marketing_nudges FOR UPDATE TO authenticated
  USING (architect_user_id = auth.uid() AND status = 'pending')
  WITH CHECK (architect_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.marketing_nudges_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service role
  IF public.has_module_permission(auth.uid(), 'marketing.curate', 'all') THEN RETURN NEW; END IF;
  IF auth.uid() <> OLD.architect_user_id THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'This question is no longer open'; END IF;
  IF OLD.expires_at IS NOT NULL AND OLD.expires_at < now() THEN RAISE EXCEPTION 'This question has expired'; END IF;
  IF NEW.status NOT IN ('answered','dismissed') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.capture_id IS DISTINCT FROM OLD.capture_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.architect_user_id IS DISTINCT FROM OLD.architect_user_id
     OR NEW.question IS DISTINCT FROM OLD.question OR NEW.ai_suggested_question IS DISTINCT FROM OLD.ai_suggested_question
     OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.story_suggestion_id IS DISTINCT FROM OLD.story_suggestion_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Only the answer can be changed';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_nudges_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER marketing_nudges_guard BEFORE UPDATE ON public.marketing_nudges
  FOR EACH ROW EXECUTE FUNCTION public.marketing_nudges_guard();

ALTER TABLE public.marketing_project_story_suggestions
  ADD COLUMN source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','architect_answer'));

CREATE POLICY marketing_voice_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-voice' AND (
    public.has_module_permission(auth.uid(), 'marketing.curate', 'all')
    OR EXISTS (SELECT 1 FROM public.marketing_nudges n
               WHERE n.id::text = (storage.foldername(name))[1] AND n.architect_user_id = auth.uid())));