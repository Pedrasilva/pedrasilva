CREATE OR REPLACE FUNCTION public.marketing_can_note_capture(_user_id uuid, _capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_module_permission(_user_id, 'marketing.curate', 'all')
    OR EXISTS (SELECT 1 FROM public.marketing_captures c WHERE c.id = _capture_id AND (
         c.created_by = _user_id
         OR (c.project_id IS NOT NULL
             AND public.has_module_permission(_user_id, 'marketing.contribute', 'own')
             AND public.marketing_is_project_team_member(_user_id, c.project_id))))
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_can_note_capture(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_can_note_capture(uuid, uuid) TO authenticated, service_role;

CREATE TABLE public.marketing_capture_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id uuid NOT NULL REFERENCES public.marketing_captures(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL DEFAULT auth.uid(),
  text text NOT NULL,
  audio_path text NULL,
  source text NOT NULL CHECK (source IN ('voice','text')),
  story_suggestion_id uuid NULL REFERENCES public.marketing_project_story_suggestions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_capture_notes_capture_idx ON public.marketing_capture_notes(capture_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.marketing_capture_notes TO authenticated;
GRANT ALL ON public.marketing_capture_notes TO service_role;
ALTER TABLE public.marketing_capture_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcn_select ON public.marketing_capture_notes FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.view', 'all') OR public.marketing_can_note_capture(auth.uid(), capture_id));
CREATE POLICY mcn_insert ON public.marketing_capture_notes FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND public.marketing_can_note_capture(auth.uid(), capture_id));
CREATE POLICY mcn_delete ON public.marketing_capture_notes FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR public.has_module_permission(auth.uid(), 'marketing.curate', 'all'));

CREATE POLICY marketing_voice_capture_notes_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-voice' AND (storage.foldername(name))[1] = 'capture-notes'
    AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    AND (public.has_module_permission(auth.uid(), 'marketing.view', 'all')
         OR public.marketing_can_note_capture(auth.uid(), ((storage.foldername(name))[2])::uuid)));
CREATE POLICY marketing_voice_capture_notes_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-voice' AND (storage.foldername(name))[1] = 'capture-notes'
    AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    AND public.marketing_can_note_capture(auth.uid(), ((storage.foldername(name))[2])::uuid));
CREATE POLICY marketing_voice_capture_notes_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-voice' AND (storage.foldername(name))[1] = 'capture-notes'
    AND (owner = auth.uid() OR public.has_module_permission(auth.uid(), 'marketing.curate', 'all')));

ALTER TABLE public.marketing_project_story_suggestions DROP CONSTRAINT marketing_project_story_suggestions_source_check;
ALTER TABLE public.marketing_project_story_suggestions ADD CONSTRAINT marketing_project_story_suggestions_source_check
  CHECK (source IN ('ai','architect_answer','architect_briefing','press_kit','team_note'));